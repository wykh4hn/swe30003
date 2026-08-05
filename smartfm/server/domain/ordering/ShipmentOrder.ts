import { Entity } from '../shared/Entity.ts';
import { Money } from '../shared/Money.ts';
import { Guard } from '../shared/Guard.ts';
import { AuthorisationError, RuleViolationError } from '../shared/DomainError.ts';
import { CargoDetails } from './CargoDetails.ts';
import { DeliveryDetails } from './DeliveryDetails.ts';
import { OrderChangeRecord } from './OrderChangeRecord.ts';
import { OrderLifecycle } from './OrderStatus.ts';
import type { OrderStatus } from './OrderStatus.ts';
import type { OrderEvent, OrderObserver } from './OrderObserver.ts';
import { TrackingUpdate } from '../tracking/TrackingUpdate.ts';

/**
 * The central transaction of SmartFM: one customer's request to move goods.
 *
 * Assignment 2 non-change N1 (the design's strongest decision): `ShipmentOrder`
 * remains the object that owns the lifecycle. Implementation confirmed this —
 * every use case in the system reaches the order, and no other class ever needed
 * to reach inside it to change status.
 *
 * Assignment 3 changes visible in this class:
 *
 *   C5  Itineraries are referenced by identity, not composed. Assignment 2 drew
 *       composition and the marker rejected it. An itinerary binds a vehicle and
 *       a driver — resources the branch owns — and it survives the order for
 *       utilisation reporting, so the order cannot own its lifetime.
 *   C4  `Route` is not held here at all. A route is a reusable lane between two
 *       cities; several orders share one. It is reached through the itinerary.
 *   C6  `OrderChangeRecord` gives the change history required by Assignment 1
 *       Task 6 an actual home.
 *   C15 Transitions are validated against the published `OrderLifecycle` table
 *       rather than ad-hoc conditionals.
 *   C17 Observers are registered explicitly instead of the pattern living in prose.
 *
 * Composition is retained (non-change N2) for `CargoDetails`, `DeliveryDetails`,
 * the tracking history and the change history: none of those has meaning once
 * the order is gone.
 */
export class ShipmentOrder extends Entity {
  readonly reference: string;
  readonly customerId: string;
  readonly branchId: string;
  readonly placedAt: Date;

  private orderCargo: CargoDetails;
  private orderDelivery: DeliveryDetails;
  private orderStatus: OrderStatus;
  private orderQuotedPrice: Money;
  private orderRejectionReason: string | undefined;
  private orderInvoiceId: string | undefined;
  private readonly orderItineraryIds: string[];
  private readonly orderTracking: TrackingUpdate[];
  private readonly orderHistory: OrderChangeRecord[];
  private readonly observers: OrderObserver[] = [];

  constructor(params: {
    id: string;
    reference: string;
    customerId: string;
    branchId: string;
    cargo: CargoDetails;
    delivery: DeliveryDetails;
    quotedPrice: Money;
    placedAt: Date;
    status?: OrderStatus;
    rejectionReason?: string | undefined;
    invoiceId?: string | undefined;
    itineraryIds?: string[];
    tracking?: TrackingUpdate[];
    history?: OrderChangeRecord[];
  }) {
    super(params.id);
    this.reference = params.reference;
    this.customerId = params.customerId;
    this.branchId = params.branchId;
    this.placedAt = params.placedAt;
    this.orderCargo = params.cargo;
    this.orderDelivery = params.delivery;
    this.orderQuotedPrice = params.quotedPrice;
    this.orderStatus = params.status ?? 'PENDING';
    this.orderRejectionReason = params.rejectionReason;
    this.orderInvoiceId = params.invoiceId;
    this.orderItineraryIds = params.itineraryIds ?? [];
    this.orderTracking = params.tracking ?? [];
    this.orderHistory = params.history ?? [];
  }

  // ---------------------------------------------------------------- accessors

  get cargo(): CargoDetails {
    return this.orderCargo;
  }

  get delivery(): DeliveryDetails {
    return this.orderDelivery;
  }

  get status(): OrderStatus {
    return this.orderStatus;
  }

  get quotedPrice(): Money {
    return this.orderQuotedPrice;
  }

  get rejectionReason(): string | undefined {
    return this.orderRejectionReason;
  }

  get invoiceId(): string | undefined {
    return this.orderInvoiceId;
  }

  get itineraryIds(): readonly string[] {
    return this.orderItineraryIds;
  }

  get trackingHistory(): readonly TrackingUpdate[] {
    return this.orderTracking;
  }

  get changeHistory(): readonly OrderChangeRecord[] {
    return this.orderHistory;
  }

  /** True when the shipment had to be split across more than one vehicle. */
  get isSplitShipment(): boolean {
    return this.orderItineraryIds.length > 1;
  }

  // ------------------------------------------------------------- authorisation

  isOwnedBy(customerId: string): boolean {
    return this.customerId === customerId;
  }

  /**
   * Assignment 1 Task 8 variant 1a: an ownership mismatch must reveal nothing
   * about another customer's shipment, so the same message is used whether the
   * order is missing or simply not theirs.
   */
  assertOwnedBy(customerId: string): void {
    if (!this.isOwnedBy(customerId)) {
      throw new AuthorisationError('No matching shipment was found for your account.');
    }
  }

  // ----------------------------------------------------------------- lifecycle

  canTransitionTo(next: OrderStatus): boolean {
    return OrderLifecycle.canTransition(this.orderStatus, next);
  }

  permittedNextStates(): readonly OrderStatus[] {
    return OrderLifecycle.permittedNextStates(this.orderStatus);
  }

  isModifiable(): boolean {
    return OrderLifecycle.isCustomerModifiable(this.orderStatus);
  }

  isOpen(): boolean {
    return OrderLifecycle.isOpen(this.orderStatus);
  }

  /**
   * The single gate through which the status may change. Every public lifecycle
   * method routes through here, so the transition table cannot be bypassed.
   */
  private transitionTo(next: OrderStatus, actor: string, summary: string, now: Date): void {
    if (!this.canTransitionTo(next)) {
      throw new RuleViolationError(
        `Order ${this.reference} is ${OrderLifecycle.describe(this.orderStatus).toLowerCase()} and cannot move to ${OrderLifecycle.describe(next).toLowerCase()}.`,
        { from: this.orderStatus, to: next, reference: this.reference },
      );
    }
    const from = this.orderStatus;
    this.orderStatus = next;
    this.orderHistory.push(
      new OrderChangeRecord({ recordedAt: now, actor, summary, fromStatus: from, toStatus: next }),
    );
  }

  /** Assignment 1 Task 7 subtask 4. */
  accept(actor: string, now: Date): void {
    this.transitionTo('ACCEPTED', actor, 'Order verified and accepted for resource assignment.', now);
    this.publish('ORDER_ACCEPTED', 'Your order has been accepted and is being scheduled.');
  }

  /** Assignment 1 Task 7 subtask 4: a rejection must always carry a reason. */
  reject(actor: string, reason: string, now: Date): void {
    const recordedReason = Guard.text('reason', reason, 5, 300);
    this.transitionTo('REJECTED', actor, `Order rejected: ${recordedReason}`, now);
    this.orderRejectionReason = recordedReason;
    this.publish('ORDER_REJECTED', `Your order was rejected: ${recordedReason}`);
  }

  /** Assignment 1 Task 7 subtask 5: dispatch requires at least one itinerary. */
  dispatch(actor: string, now: Date): void {
    if (this.orderItineraryIds.length === 0) {
      throw new RuleViolationError(
        `Order ${this.reference} has no vehicle or driver assigned and cannot be dispatched.`,
        { reference: this.reference },
      );
    }
    this.transitionTo(
      'DISPATCHED',
      actor,
      `Dispatched with ${this.orderItineraryIds.length} itinerary/itineraries.`,
      now,
    );
    this.publish('ORDER_DISPATCHED', 'Your shipment has been dispatched.');
  }

  /**
   * Assignment 1 Task 6: the customer may withdraw the order only before it is
   * dispatched. Later withdrawal is a staff exception, not a self-service action.
   */
  cancel(actor: string, reason: string, now: Date): void {
    if (!this.isModifiable() && this.orderStatus !== 'FAILED_DELIVERY') {
      throw new RuleViolationError(
        `Order ${this.reference} is already ${OrderLifecycle.describe(this.orderStatus).toLowerCase()} and can no longer be cancelled online. Please contact your branch.`,
        { status: this.orderStatus, reference: this.reference },
      );
    }
    const recordedReason = Guard.text('reason', reason, 3, 300);
    this.transitionTo('CANCELLED', actor, `Cancelled: ${recordedReason}`, now);
    this.publish('ORDER_CANCELLED', `Your order was cancelled: ${recordedReason}`);
  }

  /**
   * Assignment 1 Task 6 subtask 3: only unrestricted fields may be amended, and
   * only while the order is still modifiable.
   */
  amendDelivery(
    changes: Parameters<DeliveryDetails['amended']>[0],
    actor: string,
    now: Date,
  ): void {
    if (!this.isModifiable()) {
      throw new RuleViolationError(
        `Order ${this.reference} is ${OrderLifecycle.describe(this.orderStatus).toLowerCase()} and can no longer be changed online.`,
        { status: this.orderStatus, reference: this.reference },
      );
    }
    const changed = Object.entries(changes)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
    if (changed.length === 0) {
      throw new RuleViolationError('No changes were supplied.');
    }
    this.orderDelivery = this.orderDelivery.amended(changes);
    this.orderHistory.push(
      new OrderChangeRecord({ recordedAt: now, actor, summary: `Delivery details amended: ${changed.join(', ')}.` }),
    );
    this.publish('ORDER_AMENDED', `Your order details were updated: ${changed.join(', ')}.`);
  }

  /** Re-pricing after an amendment, or the branch correcting a quote. */
  reprice(price: Money, actor: string, now: Date): void {
    if (this.orderInvoiceId !== undefined) {
      throw new RuleViolationError('The order has already been invoiced and cannot be re-priced.');
    }
    this.orderQuotedPrice = price;
    this.orderHistory.push(
      new OrderChangeRecord({ recordedAt: now, actor, summary: `Quote updated to ${price.format()}.` }),
    );
  }

  // ------------------------------------------------------- resources & billing

  /** Change C5: the order records *which* itineraries serve it, not the objects. */
  attachItinerary(itineraryId: string, now: Date, actor: string): void {
    if (this.orderItineraryIds.includes(itineraryId)) {
      return;
    }
    this.orderItineraryIds.push(itineraryId);
    this.orderHistory.push(
      new OrderChangeRecord({ recordedAt: now, actor, summary: `Itinerary ${itineraryId} assigned.` }),
    );
  }

  detachItineraries(now: Date, actor: string): string[] {
    const released = [...this.orderItineraryIds];
    this.orderItineraryIds.length = 0;
    if (released.length > 0) {
      this.orderHistory.push(
        new OrderChangeRecord({ recordedAt: now, actor, summary: `Released ${released.length} itinerary/itineraries.` }),
      );
    }
    return released;
  }

  attachInvoice(invoiceId: string, now: Date): void {
    if (this.orderInvoiceId !== undefined) {
      throw new RuleViolationError(`Order ${this.reference} has already been invoiced.`);
    }
    this.orderInvoiceId = invoiceId;
    this.orderHistory.push(
      new OrderChangeRecord({ recordedAt: now, actor: 'Billing', summary: `Invoice ${invoiceId} issued.` }),
    );
    this.publish('INVOICE_ISSUED', `An invoice for ${this.orderQuotedPrice.format()} is now available.`);
  }

  confirmPaid(receiptNumber: string, now: Date): void {
    this.orderHistory.push(
      new OrderChangeRecord({ recordedAt: now, actor: 'Billing', summary: `Payment confirmed, receipt ${receiptNumber}.` }),
    );
    this.publish('PAYMENT_CONFIRMED', `Payment received. Receipt ${receiptNumber} is available in your account.`);
  }

  // ------------------------------------------------------------------ tracking

  /**
   * Assignment 1 Task 8. The order — not the driver and not a service — appends
   * to its own timeline, because the order owns the history and therefore owns
   * the rules about what may be appended.
   */
  appendTracking(update: TrackingUpdate): void {
    if (update.orderId !== this.id) {
      throw new RuleViolationError('This tracking update belongs to a different shipment.');
    }
    if (!this.orderItineraryIds.includes(update.itineraryId)) {
      throw new AuthorisationError('Only a driver on an itinerary for this shipment may post tracking updates.');
    }
    if (this.orderStatus !== 'DISPATCHED' && this.orderStatus !== 'IN_TRANSIT' && this.orderStatus !== 'FAILED_DELIVERY') {
      throw new RuleViolationError(
        `Order ${this.reference} is ${OrderLifecycle.describe(this.orderStatus).toLowerCase()}; tracking updates are only accepted for a shipment that is under way.`,
      );
    }
    const latest = this.latestTracking();
    if (latest !== undefined && !update.isAfter(latest)) {
      throw new RuleViolationError('A tracking update cannot be dated before the previous checkpoint.');
    }

    this.orderTracking.push(update);
    this.applyTrackingConsequences(update);
    this.publish('TRACKING_UPDATED', update.describe());
  }

  /** A checkpoint may advance the order's own lifecycle. */
  private applyTrackingConsequences(update: TrackingUpdate): void {
    const now = update.recordedAt;
    switch (update.state) {
      case 'DELIVERED':
        this.transitionTo('DELIVERED', 'Driver', 'Delivery confirmed by driver.', now);
        this.publish('DELIVERY_COMPLETED', 'Your shipment has been delivered.');
        break;
      case 'FAILED_ATTEMPT':
        this.transitionTo('FAILED_DELIVERY', 'Driver', update.note ?? 'Delivery attempt failed.', now);
        this.publish('DELIVERY_FAILED', `Delivery attempt failed: ${update.note ?? 'no reason recorded'}.`);
        break;
      case 'PICKED_UP':
      case 'IN_TRANSIT':
      case 'AT_HUB':
      case 'OUT_FOR_DELIVERY':
        if (this.canTransitionTo('IN_TRANSIT')) {
          this.transitionTo('IN_TRANSIT', 'Driver', 'Shipment is under way.', now);
        }
        break;
      case 'DELAYED':
        // A delay revises the ETA but does not change the lifecycle state.
        break;
      default:
        break;
    }
  }

  latestTracking(): TrackingUpdate | undefined {
    return this.orderTracking[this.orderTracking.length - 1];
  }

  /** Current ETA: the most recent one a driver supplied, else the customer's deadline. */
  currentEta(): Date {
    for (let index = this.orderTracking.length - 1; index >= 0; index -= 1) {
      const eta = this.orderTracking[index]?.estimatedArrival;
      if (eta !== undefined) {
        return eta;
      }
    }
    return this.orderDelivery.requiredDeliveryBy;
  }

  /** Used by the shipment-statistics report. */
  wasDeliveredOnTime(): boolean | undefined {
    if (this.orderStatus !== 'DELIVERED') {
      return undefined;
    }
    const delivered = this.orderTracking.find((update) => update.state === 'DELIVERED');
    if (delivered === undefined) {
      return undefined;
    }
    return delivered.recordedAt.getTime() <= this.orderDelivery.requiredDeliveryBy.getTime();
  }

  // ------------------------------------------------------------------ observer

  registerObserver(observer: OrderObserver): void {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
  }

  removeObserver(observer: OrderObserver): void {
    const index = this.observers.indexOf(observer);
    if (index >= 0) {
      this.observers.splice(index, 1);
    }
  }

  /**
   * Change C17. The event is published only after the state change has been
   * committed to the order, and a failing observer must never roll back a
   * business fact — Assignment 2 Scenario 3 required exactly this.
   */
  private publish(event: OrderEvent, detail: string): void {
    for (const observer of this.observers) {
      try {
        observer.onOrderEvent(this, event, detail);
      } catch {
        // Notification delivery is outside the domain boundary and must not
        // invalidate a committed shipment event.
      }
    }
  }

  /** Emitted by the ordering service once the order has been persisted. */
  announcePlacement(): void {
    this.publish('ORDER_PLACED', `Order ${this.reference} received and is awaiting branch review.`);
  }

  summary(): string {
    return `${this.reference}: ${this.orderCargo.summary()} — ${this.orderDelivery.summary()} [${OrderLifecycle.describe(this.orderStatus)}]`;
  }
}
