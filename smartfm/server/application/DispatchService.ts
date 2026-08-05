import { Itinerary } from '../domain/dispatch/Itinerary.ts';
import type { Route } from '../domain/dispatch/Route.ts';
import type { ShipmentOrder } from '../domain/ordering/ShipmentOrder.ts';
import type { Vehicle } from '../domain/fleet/Vehicle.ts';
import type { Driver } from '../domain/people/Driver.ts';
import { DateRange } from '../domain/shared/DateRange.ts';
import { Guard } from '../domain/shared/Guard.ts';
import { ConflictError, RuleViolationError } from '../domain/shared/DomainError.ts';
import type { BranchRepository, VehicleRepository } from '../infrastructure/persistence/FleetRepositories.ts';
import type { DriverRepository } from '../infrastructure/persistence/PeopleRepositories.ts';
import type {
  CapacityHoldRepository,
  ShipmentOrderRepository,
} from '../infrastructure/persistence/OrderingRepositories.ts';
import type { ItineraryRepository } from '../infrastructure/persistence/DispatchRepositories.ts';
import type { Clock } from '../infrastructure/Clock.ts';
import type { IdGenerator } from '../infrastructure/IdGenerator.ts';
import type { RoutePlanner } from './RoutePlanner.ts';
import type { NotificationService } from './NotificationService.ts';
import type { BillingService } from './BillingService.ts';

/** What the branch is told before deciding to accept or reject. */
export interface OrderReview {
  readonly orderReference: string;
  readonly customerName: string;
  readonly cargoSummary: string;
  readonly deliverySummary: string;
  readonly routeLabel: string;
  readonly quoteFormatted: string;
  readonly problems: readonly string[];
  readonly warnings: readonly string[];
  readonly canAccept: boolean;
}

/** A vehicle-and-driver pairing the branch can assign to a leg. */
export interface AssignmentSuggestion {
  readonly vehicleId: string;
  readonly vehicleLabel: string;
  readonly driverId: string;
  readonly driverName: string;
  readonly driverLicenceClass: string;
  readonly capacityKg: number;
}

/**
 * Business area 4 — Order Processing and Dispatch (Assignment 1 Task 7).
 *
 * Part of change C1, and the service where changes C4 and C5 come together.
 * Assignment 2 assigned route and itinerary creation to `Branch`; implementation
 * showed that a branch can neither see the national route network nor check
 * another branch's live itineraries for clashes. Planning therefore sits here,
 * over `RoutePlanner` (routes) and `ItineraryRepository` (clash detection),
 * while `Branch.assertMayProcess()`, `Itinerary.conflictsWith()`,
 * `Vehicle.reserveFor()` and `Driver.assignToDuty()` keep the individual rules.
 */
export class DispatchService {
  private readonly orders: ShipmentOrderRepository;
  private readonly itineraries: ItineraryRepository;
  private readonly vehicles: VehicleRepository;
  private readonly drivers: DriverRepository;
  private readonly branches: BranchRepository;
  private readonly holds: CapacityHoldRepository;
  private readonly routePlanner: RoutePlanner;
  private readonly billing: BillingService;
  private readonly notifications: NotificationService;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(dependencies: {
    orders: ShipmentOrderRepository;
    itineraries: ItineraryRepository;
    vehicles: VehicleRepository;
    drivers: DriverRepository;
    branches: BranchRepository;
    holds: CapacityHoldRepository;
    routePlanner: RoutePlanner;
    billing: BillingService;
    notifications: NotificationService;
    clock: Clock;
    ids: IdGenerator;
  }) {
    this.orders = dependencies.orders;
    this.itineraries = dependencies.itineraries;
    this.vehicles = dependencies.vehicles;
    this.drivers = dependencies.drivers;
    this.branches = dependencies.branches;
    this.holds = dependencies.holds;
    this.routePlanner = dependencies.routePlanner;
    this.billing = dependencies.billing;
    this.notifications = dependencies.notifications;
    this.clock = dependencies.clock;
    this.ids = dependencies.ids;
  }

  /** Assignment 1 Task 7 subtask 1: the branch's queue of pending work. */
  async pendingQueue(branchId: string): Promise<ShipmentOrder[]> {
    const orders = await this.orders.findPendingForBranch(branchId);
    for (const order of orders) {
      order.registerObserver(this.notifications);
    }
    return orders;
  }

  async branchOrders(branchId: string): Promise<ShipmentOrder[]> {
    const orders = await this.orders.findWhere((order) => order.branchId === branchId);
    for (const order of orders) {
      order.registerObserver(this.notifications);
    }
    return orders.sort((left, right) => right.placedAt.getTime() - left.placedAt.getTime());
  }

  /**
   * Assignment 1 Task 7 subtasks 2-3, including variants 3a (missing details),
   * 3b (duplicate order) and 3c (address cannot be verified). Problems block
   * acceptance; warnings do not.
   */
  async reviewOrder(branchId: string, orderId: string, customerName: string): Promise<OrderReview> {
    const branch = await this.branches.requireById(branchId, 'Branch');
    const order = await this.orders.requireById(orderId, 'Shipment order');
    branch.assertMayProcess(order);

    const problems: string[] = [];
    const warnings: string[] = [];

    if (order.status !== 'PENDING') {
      problems.push(`This order has already been processed (${order.status}).`);
    }
    if (!order.delivery.isServiceable()) {
      problems.push('The pickup or delivery address is outside the ABC-Trans service network and cannot be verified.');
    }
    if (order.delivery.requiredDeliveryBy.getTime() <= this.clock.now().getTime()) {
      problems.push('The requested delivery deadline has already passed. Ask the customer to supply a new date.');
    }

    const route = await this.routePlanner.planRoute(
      order.delivery.pickupAddress.city,
      order.delivery.deliveryAddress.city,
    );
    const windowMinutes = order.delivery.serviceWindow().durationHours() * 60;
    if (!route.fitsWithin(windowMinutes)) {
      problems.push(
        `The route needs about ${route.estimatedDurationHours()} hours but the customer's window is only ${Math.round(windowMinutes / 60)} hours.`,
      );
    }

    const duplicate = await this.findLikelyDuplicate(order);
    if (duplicate !== undefined) {
      warnings.push(
        `Possible duplicate of order ${duplicate.reference}, placed by the same customer for the same lane within an hour. Re-check before accepting.`,
      );
    }
    if (order.cargo.requiresSpecialHandling()) {
      warnings.push(`Cargo requires ${order.cargo.handling.toLowerCase()} handling — assign a suitable vehicle.`);
    }

    return {
      orderReference: order.reference,
      customerName,
      cargoSummary: order.cargo.summary(),
      deliverySummary: `${order.delivery.pickupAddress.format()} -> ${order.delivery.deliveryAddress.format()}`,
      routeLabel: route.label(),
      quoteFormatted: order.quotedPrice.format(),
      problems,
      warnings,
      canAccept: problems.length === 0,
    };
  }

  /** Assignment 1 Task 7 variant 3b. */
  private async findLikelyDuplicate(order: ShipmentOrder): Promise<ShipmentOrder | undefined> {
    const oneHour = 60 * 60 * 1000;
    return this.orders.findOneWhere(
      (candidate) =>
        candidate.id !== order.id &&
        candidate.customerId === order.customerId &&
        candidate.status !== 'CANCELLED' &&
        candidate.status !== 'REJECTED' &&
        candidate.delivery.deliveryAddress.equals(order.delivery.deliveryAddress) &&
        Math.abs(candidate.placedAt.getTime() - order.placedAt.getTime()) < oneHour,
    );
  }

  /** Assignment 1 Task 7 subtask 4 (accept). */
  async acceptOrder(branchId: string, orderId: string, staffName: string): Promise<ShipmentOrder> {
    const branch = await this.branches.requireById(branchId, 'Branch');
    const order = await this.orders.requireById(orderId, 'Shipment order');
    branch.assertMayProcess(order);
    order.registerObserver(this.notifications);

    if (!order.delivery.isServiceable()) {
      throw new RuleViolationError(
        'The delivery address cannot be verified. Reject the order or ask the customer to correct it.',
      );
    }

    order.accept(Guard.text('staffName', staffName, 2, 100), this.clock.now());
    return this.orders.save(order);
  }

  /** Assignment 1 Task 7 subtask 4 (reject), always with a recorded reason. */
  async rejectOrder(branchId: string, orderId: string, staffName: string, reason: unknown): Promise<ShipmentOrder> {
    const branch = await this.branches.requireById(branchId, 'Branch');
    const order = await this.orders.requireById(orderId, 'Shipment order');
    branch.assertMayProcess(order);
    order.registerObserver(this.notifications);

    order.reject(Guard.text('staffName', staffName, 2, 100), String(reason ?? ''), this.clock.now());
    await this.orders.save(order);

    const holds = await this.holds.findForOrder(orderId);
    for (const hold of holds) {
      hold.release();
    }
    await this.holds.saveAll(holds);
    return order;
  }

  /** Offers the branch the vehicle/driver pairings that are legal right now. */
  async suggestAssignments(branchId: string, orderId: string): Promise<AssignmentSuggestion[]> {
    const order = await this.orders.requireById(orderId, 'Shipment order');
    const window = order.delivery.serviceWindow();

    const fleet = (await this.vehicles.findByBranch(branchId)).filter((vehicle) => vehicle.isAvailableDuring(window));
    const crew = (await this.drivers.findByBranch(branchId)).filter((driver) => driver.isAvailableDuring(window));
    const live = await this.itineraries.findLive();

    const suggestions: AssignmentSuggestion[] = [];
    const usedDriverIds = new Set<string>();

    for (const vehicle of fleet) {
      if (live.some((itinerary) => itinerary.vehicleId === vehicle.id && itinerary.window.overlaps(window))) {
        continue;
      }
      const driver = crew.find(
        (candidate) =>
          !usedDriverIds.has(candidate.id) &&
          candidate.qualifiesFor(vehicle.requiredLicenceClass()) &&
          !live.some((itinerary) => itinerary.driverId === candidate.id && itinerary.window.overlaps(window)),
      );
      if (driver === undefined) {
        continue;
      }
      usedDriverIds.add(driver.id);
      suggestions.push({
        vehicleId: vehicle.id,
        vehicleLabel: vehicle.label(),
        driverId: driver.id,
        driverName: driver.fullName,
        driverLicenceClass: driver.licenceClass,
        capacityKg: vehicle.maxWeightKg,
      });
    }
    return suggestions;
  }

  /**
   * Assignment 1 Task 7 subtask 5: bind vehicles and drivers to the order.
   *
   * Every pairing is validated before a single object is written, so a rejected
   * assignment cannot leave half an itinerary behind — the roll-back postcondition
   * Assignment 2's Scenario 2 stated but had no mechanism for.
   */
  async assignResources(
    branchId: string,
    orderId: string,
    assignments: readonly { vehicleId: unknown; driverId: unknown; weightKg?: unknown }[],
    staffName: string,
  ): Promise<Itinerary[]> {
    const now = this.clock.now();
    const branch = await this.branches.requireById(branchId, 'Branch');
    const order = await this.orders.requireById(orderId, 'Shipment order');
    branch.assertMayProcess(order);
    order.registerObserver(this.notifications);

    if (order.status !== 'ACCEPTED') {
      throw new RuleViolationError(
        `Only an accepted order can be assigned resources. Order ${order.reference} is ${order.status}.`,
      );
    }
    Guard.require(assignments.length > 0, 'assignments', 'Assign at least one vehicle and driver.');

    const route = await this.routePlanner.planRoute(
      order.delivery.pickupAddress.city,
      order.delivery.deliveryAddress.city,
    );
    const window = order.delivery.serviceWindow();
    const live = await this.itineraries.findLive();

    const prepared = await this.validateAssignments(order, assignments, route, window, live, branchId);

    // Every check has passed; only now is anything written.
    const created: Itinerary[] = [];
    for (const item of prepared) {
      item.vehicle.reserveFor(item.itinerary.id);
      item.driver.assignToDuty(item.itinerary.id);
      order.attachItinerary(item.itinerary.id, now, staffName);
      created.push(item.itinerary);
    }

    await this.itineraries.saveAll(created);
    await this.vehicles.saveAll(prepared.map((item) => item.vehicle));
    await this.drivers.saveAll(prepared.map((item) => item.driver));
    await this.orders.save(order);

    const holds = await this.holds.findForOrder(orderId);
    for (const hold of holds) {
      hold.release();
    }
    await this.holds.saveAll(holds);

    return created;
  }

  private async validateAssignments(
    order: ShipmentOrder,
    assignments: readonly { vehicleId: unknown; driverId: unknown; weightKg?: unknown }[],
    route: Route,
    window: DateRange,
    live: readonly Itinerary[],
    branchId: string,
  ): Promise<{ itinerary: Itinerary; vehicle: Vehicle; driver: Driver }[]> {
    const prepared: { itinerary: Itinerary; vehicle: Vehicle; driver: Driver }[] = [];
    const seenVehicleIds = new Set<string>();
    const seenDriverIds = new Set<string>();
    let coveredWeight = 0;

    for (const [index, assignment] of assignments.entries()) {
      const vehicle = await this.vehicles.requireById(String(assignment.vehicleId), 'Vehicle');
      const driver = await this.drivers.requireById(String(assignment.driverId), 'Driver');

      if (seenVehicleIds.has(vehicle.id)) {
        throw new ConflictError(`${vehicle.label()} was assigned to more than one leg of this order.`);
      }
      if (seenDriverIds.has(driver.id)) {
        throw new ConflictError(`${driver.fullName} was assigned to more than one leg of this order.`);
      }
      seenVehicleIds.add(vehicle.id);
      seenDriverIds.add(driver.id);

      if (vehicle.status !== 'AVAILABLE') {
        throw new ConflictError(`${vehicle.label()} is ${vehicle.status.toLowerCase().replace('_', ' ')}.`);
      }
      if (!driver.isAvailableDuring(window)) {
        throw new ConflictError(`${driver.fullName} is ${driver.availability.toLowerCase().replace('_', ' ')} for this window.`);
      }
      if (!driver.qualifiesFor(vehicle.requiredLicenceClass())) {
        throw new RuleViolationError(
          `${driver.fullName} holds licence ${driver.licenceClass} but ${vehicle.label()} requires ${vehicle.requiredLicenceClass()}.`,
        );
      }
      if (order.cargo.handling === 'REFRIGERATED' && !vehicle.isRefrigerated) {
        throw new RuleViolationError(`${vehicle.label()} is not refrigerated and cannot carry this shipment.`);
      }

      const legWeight = Number(
        assignment.weightKg ?? Math.min(vehicle.maxWeightKg, order.cargo.totalWeightKg - coveredWeight),
      );
      if (legWeight > vehicle.maxWeightKg) {
        throw new RuleViolationError(
          `${vehicle.label()} can take ${vehicle.maxWeightKg} kg but ${legWeight} kg was assigned to it.`,
        );
      }
      coveredWeight += legWeight;

      const itinerary = new Itinerary({
        id: this.ids.next('itn'),
        orderId: order.id,
        branchId,
        vehicleId: vehicle.id,
        driverId: driver.id,
        routeId: route.id,
        legNumber: index + 1,
        assignedWeightKg: legWeight,
        window,
      });

      const clash = live.find((existing) => itinerary.conflictsWith(existing));
      if (clash !== undefined) {
        throw new ConflictError(
          `${vehicle.label()} or ${driver.fullName} is already committed to itinerary ${clash.id} during this window.`,
        );
      }
      prepared.push({ itinerary, vehicle, driver });
    }

    if (coveredWeight + 0.5 < order.cargo.totalWeightKg) {
      throw new RuleViolationError(
        `The assigned vehicles cover ${coveredWeight} kg but the shipment weighs ${order.cargo.totalWeightKg} kg. Assign another vehicle.`,
      );
    }
    return prepared;
  }

  /**
   * Assignment 1 Task 7 subtask 5 completion: the order leaves the branch and
   * the invoice is issued for the agreed quote.
   */
  async dispatchOrder(branchId: string, orderId: string, staffName: string): Promise<ShipmentOrder> {
    const now = this.clock.now();
    const branch = await this.branches.requireById(branchId, 'Branch');
    const order = await this.orders.requireById(orderId, 'Shipment order');
    branch.assertMayProcess(order);
    order.registerObserver(this.notifications);

    order.dispatch(Guard.text('staffName', staffName, 2, 100), now);

    const itineraries = await this.itineraries.findByOrder(orderId);
    for (const itinerary of itineraries) {
      if (itinerary.status === 'PLANNED') {
        itinerary.activate();
      }
    }
    await this.itineraries.saveAll(itineraries);
    await this.orders.save(order);

    await this.billing.issueInvoiceFor(order);
    return this.orders.requireById(orderId, 'Shipment order');
  }
}
