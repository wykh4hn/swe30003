import { TrackingUpdate } from '../domain/tracking/TrackingUpdate.ts';
import type { Itinerary } from '../domain/dispatch/Itinerary.ts';
import type { ShipmentOrder } from '../domain/ordering/ShipmentOrder.ts';
import { AuthorisationError, NotFoundError } from '../domain/shared/DomainError.ts';
import type { ShipmentOrderRepository } from '../infrastructure/persistence/OrderingRepositories.ts';
import type { ItineraryRepository } from '../infrastructure/persistence/DispatchRepositories.ts';
import type { VehicleRepository } from '../infrastructure/persistence/FleetRepositories.ts';
import type { DriverRepository } from '../infrastructure/persistence/PeopleRepositories.ts';
import type { RouteRepository } from '../infrastructure/persistence/DispatchRepositories.ts';
import type { Clock } from '../infrastructure/Clock.ts';
import type { IdGenerator } from '../infrastructure/IdGenerator.ts';
import type { NotificationService } from './NotificationService.ts';

/** One entry in the customer-facing timeline. */
export interface TimelineEntry {
  readonly recordedAt: string;
  readonly state: string;
  readonly description: string;
  readonly estimatedArrival: string | undefined;
}

/** Everything the tracking screen shows for one shipment. */
export interface ShipmentTimeline {
  readonly orderReference: string;
  readonly statusLabel: string;
  readonly currentEta: string;
  readonly isDelayed: boolean;
  readonly entries: readonly TimelineEntry[];
  readonly routeLabel: string | undefined;
  readonly nextStep: string;
}

/** A job as the driver sees it on their phone. */
export interface DriverJob {
  readonly itineraryId: string;
  readonly orderId: string;
  readonly orderReference: string;
  readonly status: string;
  readonly vehicleLabel: string;
  readonly cargoSummary: string;
  readonly pickup: string;
  readonly destination: string;
  readonly dueBy: string;
  readonly assignedWeightKg: number;
}

/**
 * Business area 6 — Shipment Tracking (Assignment 1 Task 8).
 *
 * Part of change C1. This service is deliberately thin, and that is the point:
 * every rule about what may be appended to a timeline — the driver must be on an
 * itinerary for this shipment, the order must actually be under way, a checkpoint
 * cannot pre-date the previous one — lives in `ShipmentOrder.appendTracking()`,
 * because the order owns its history. The service only fetches the objects
 * involved and persists the result.
 *
 * That division is what makes Assignment 1 Task 8 variant 1a enforceable: an
 * ownership mismatch is refused by the order itself, so no route through the
 * system can leak another customer's shipment.
 */
export class TrackingService {
  private readonly orders: ShipmentOrderRepository;
  private readonly itineraries: ItineraryRepository;
  private readonly vehicles: VehicleRepository;
  private readonly drivers: DriverRepository;
  private readonly routes: RouteRepository;
  private readonly notifications: NotificationService;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(dependencies: {
    orders: ShipmentOrderRepository;
    itineraries: ItineraryRepository;
    vehicles: VehicleRepository;
    drivers: DriverRepository;
    routes: RouteRepository;
    notifications: NotificationService;
    clock: Clock;
    ids: IdGenerator;
  }) {
    this.orders = dependencies.orders;
    this.itineraries = dependencies.itineraries;
    this.vehicles = dependencies.vehicles;
    this.drivers = dependencies.drivers;
    this.routes = dependencies.routes;
    this.notifications = dependencies.notifications;
    this.clock = dependencies.clock;
    this.ids = dependencies.ids;
  }

  /** Assignment 1 Task 8 subtask 1: the driver's list of live jobs. */
  async jobsForDriver(driverId: string): Promise<DriverJob[]> {
    const itineraries = await this.itineraries.findLiveForDriver(driverId);
    const jobs: DriverJob[] = [];

    for (const itinerary of itineraries) {
      const order = await this.orders.findById(itinerary.orderId);
      const vehicle = await this.vehicles.findById(itinerary.vehicleId);
      if (order === undefined) {
        continue;
      }
      jobs.push({
        itineraryId: itinerary.id,
        orderId: order.id,
        orderReference: order.reference,
        status: order.status,
        vehicleLabel: vehicle?.label() ?? itinerary.vehicleId,
        cargoSummary: order.cargo.summary(),
        pickup: order.delivery.pickupAddress.format(),
        destination: order.delivery.deliveryAddress.format(),
        dueBy: order.delivery.requiredDeliveryBy.toISOString(),
        assignedWeightKg: itinerary.assignedWeightKg,
      });
    }
    return jobs;
  }

  /**
   * Assignment 1 Task 8: the driver posts a checkpoint.
   *
   * The order validates and appends; a `DELIVERED` checkpoint additionally
   * completes the itinerary and returns the vehicle and driver to the pool, which
   * is what keeps `ResourceUtilisationReport` honest.
   */
  async recordUpdate(
    driverId: string,
    input: { itineraryId: unknown; state: unknown; locationLabel: unknown; estimatedArrival?: unknown; note?: unknown },
  ): Promise<ShipmentOrder> {
    const now = this.clock.now();
    const itinerary = await this.itineraries.findById(String(input.itineraryId));
    if (itinerary === undefined) {
      throw new NotFoundError('Itinerary', String(input.itineraryId));
    }
    if (itinerary.driverId !== driverId) {
      throw new AuthorisationError('This itinerary is assigned to another driver.');
    }

    const order = await this.orders.requireById(itinerary.orderId, 'Shipment order');
    order.registerObserver(this.notifications);

    const update = TrackingUpdate.create({
      id: this.ids.next('trk'),
      orderId: order.id,
      itineraryId: itinerary.id,
      recordedByDriverId: driverId,
      recordedAt: now,
      state: input.state,
      locationLabel: input.locationLabel,
      estimatedArrival: input.estimatedArrival,
      note: input.note,
    });

    order.appendTracking(update);
    await this.orders.save(order);

    if (update.isTerminal()) {
      await this.completeItinerary(itinerary, now);
    }
    return order;
  }

  /** Releases the resources once a leg is finished. */
  private async completeItinerary(itinerary: Itinerary, now: Date): Promise<void> {
    if (itinerary.isLive()) {
      itinerary.complete(now);
      await this.itineraries.save(itinerary);
    }

    const vehicle = await this.vehicles.findById(itinerary.vehicleId);
    if (vehicle !== undefined) {
      const route = await this.routes.findById(itinerary.routeId);
      vehicle.release(route?.totalDistanceKm() ?? 0);
      await this.vehicles.save(vehicle);
    }

    const driver = await this.drivers.findById(itinerary.driverId);
    if (driver !== undefined) {
      driver.releaseFromDuty();
      await this.drivers.save(driver);
    }
  }

  /**
   * Assignment 1 Task 8 subtasks 2-3, with the ownership check of variant 1a
   * applied by the order itself before any data is assembled.
   */
  async timelineForCustomer(customerId: string, orderId: string): Promise<ShipmentTimeline> {
    const order = await this.orders.findById(orderId);
    if (order === undefined) {
      throw new NotFoundError('Shipment order', orderId);
    }
    order.assertOwnedBy(customerId);
    return this.buildTimeline(order);
  }

  /** Lookup by human reference, as used at a branch counter. */
  async timelineByReference(customerId: string, reference: string): Promise<ShipmentTimeline> {
    const order = await this.orders.findByReference(reference);
    if (order === undefined) {
      throw new NotFoundError('Shipment order', reference);
    }
    order.assertOwnedBy(customerId);
    return this.buildTimeline(order);
  }

  private async buildTimeline(order: ShipmentOrder): Promise<ShipmentTimeline> {
    const itineraries = await this.itineraries.findByOrder(order.id);
    const firstItinerary = itineraries[0];
    const route = firstItinerary === undefined ? undefined : await this.routes.findById(firstItinerary.routeId);
    const latest = order.latestTracking();
    const eta = order.currentEta();

    return {
      orderReference: order.reference,
      statusLabel: OrderStatusLabel.of(order),
      currentEta: eta.toISOString(),
      isDelayed:
        latest?.state === 'DELAYED' || (order.isOpen() && eta.getTime() > order.delivery.requiredDeliveryBy.getTime()),
      routeLabel: route?.label(),
      nextStep: TrackingService.describeNextStep(order),
      entries: order.trackingHistory.map((update) => ({
        recordedAt: update.recordedAt.toISOString(),
        state: update.state,
        description: update.describe(),
        estimatedArrival: update.estimatedArrival?.toISOString(),
      })),
    };
  }

  /** Assignment 1 Task 8 variant 2b: tell the customer what happens next. */
  private static describeNextStep(order: ShipmentOrder): string {
    switch (order.status) {
      case 'PENDING':
        return 'Your branch is reviewing this order. You can still amend or cancel it.';
      case 'ACCEPTED':
        return 'A vehicle and driver are being assigned. You can still cancel before dispatch.';
      case 'REJECTED':
        return `This order was rejected: ${order.rejectionReason ?? 'no reason recorded'}.`;
      case 'DISPATCHED':
        return 'Your shipment has left the branch and is on its way to pickup.';
      case 'IN_TRANSIT':
        return 'Your shipment is on the road. Checkpoints appear here as the driver reports them.';
      case 'DELIVERED':
        return 'Delivered. Your receipt is available in Billing.';
      case 'FAILED_DELIVERY':
        return 'The delivery attempt failed. ABC-Trans will contact you to arrange re-delivery or branch pickup.';
      case 'CANCELLED':
        return 'This order was cancelled.';
      default:
        return '';
    }
  }
}

/** Small helper so the timeline and the UI use identical wording. */
class OrderStatusLabel {
  private constructor() {
    // Static utility; never instantiated.
  }

  static of(order: ShipmentOrder): string {
    const latest = order.latestTracking();
    if (latest !== undefined && latest.state === 'DELAYED') {
      return 'Delayed';
    }
    return order.status.replace('_', ' ').toLowerCase().replace(/^./, (char) => char.toUpperCase());
  }
}
