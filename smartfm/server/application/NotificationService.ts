import type { OrderEvent, OrderObserver } from '../domain/ordering/OrderObserver.ts';
import type { ShipmentOrder } from '../domain/ordering/ShipmentOrder.ts';
import type { Clock } from '../infrastructure/Clock.ts';

/** One message queued for a customer. */
export interface Notification {
  readonly customerId: string;
  readonly orderReference: string;
  readonly event: OrderEvent;
  readonly message: string;
  readonly raisedAt: Date;
}

const MAX_RETAINED = 200;

/**
 * The concrete observer in SmartFM's application of the Observer pattern.
 *
 * Assignment 3 change C17. Assignment 2 §5.2 named `Customer` as the observer,
 * which implementation showed to be the wrong choice: a customer is a domain
 * fact, and making it the observer drags email/SMS delivery concerns into the
 * domain layer. `ShipmentOrder` publishes events; this service decides — from
 * the customer's opt-in preference — what is actually sent.
 *
 * Assignment 2 non-change N9 is honoured deliberately: the Assignment 2 design
 * ruled that "Notification: not persisted — the SRS requires customer
 * notification, not a notification-history domain object", and that judgement
 * still holds. Messages are therefore held in a bounded in-memory buffer and are
 * *not* a domain entity with a repository. The only accommodation is that the
 * buffer is readable through the API, so the demonstration can show that
 * notifications were genuinely raised.
 */
export class NotificationService implements OrderObserver {
  private readonly clock: Clock;
  private readonly messages: Notification[] = [];
  private readonly optedOutCustomerIds = new Set<string>();

  constructor(clock: Clock) {
    this.clock = clock;
  }

  /** Called by the account service whenever a customer changes their preference. */
  setPreference(customerId: string, enabled: boolean): void {
    if (enabled) {
      this.optedOutCustomerIds.delete(customerId);
    } else {
      this.optedOutCustomerIds.add(customerId);
    }
  }

  /**
   * The observer callback. It never throws: `ShipmentOrder.publish()` treats
   * notification as outside the domain boundary, so a delivery problem must not
   * roll back a committed shipment event (Assignment 2 Scenario 3, alternate path).
   */
  onOrderEvent(order: ShipmentOrder, event: OrderEvent, detail: string): void {
    if (this.optedOutCustomerIds.has(order.customerId)) {
      return;
    }
    this.messages.push({
      customerId: order.customerId,
      orderReference: order.reference,
      event,
      message: detail,
      raisedAt: this.clock.now(),
    });
    if (this.messages.length > MAX_RETAINED) {
      this.messages.splice(0, this.messages.length - MAX_RETAINED);
    }
  }

  /** Newest first, for the customer's notification panel. */
  inboxFor(customerId: string, limit = 25): Notification[] {
    return this.messages
      .filter((message) => message.customerId === customerId)
      .slice(-limit)
      .reverse();
  }

  recent(limit = 25): Notification[] {
    return this.messages.slice(-limit).reverse();
  }

  clear(): void {
    this.messages.length = 0;
  }
}
