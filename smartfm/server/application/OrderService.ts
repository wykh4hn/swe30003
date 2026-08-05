import { ShipmentOrder } from '../domain/ordering/ShipmentOrder.ts';
import { CargoDetails } from '../domain/ordering/CargoDetails.ts';
import { DeliveryDetails } from '../domain/ordering/DeliveryDetails.ts';
import { CapacityHold } from '../domain/ordering/CapacityHold.ts';
import { Address } from '../domain/shared/Address.ts';
import { Guard } from '../domain/shared/Guard.ts';
import { ConflictError, NotFoundError, RuleViolationError } from '../domain/shared/DomainError.ts';
import type { Money } from '../domain/shared/Money.ts';
import type { Vehicle } from '../domain/fleet/Vehicle.ts';
import type { Route } from '../domain/dispatch/Route.ts';
import type { VehicleRepository, BranchRepository } from '../infrastructure/persistence/FleetRepositories.ts';
import type {
  CapacityHoldRepository,
  ShipmentOrderRepository,
} from '../infrastructure/persistence/OrderingRepositories.ts';
import type { ItineraryRepository } from '../infrastructure/persistence/DispatchRepositories.ts';
import type { CustomerRepository } from '../infrastructure/persistence/PeopleRepositories.ts';
import type { Clock } from '../infrastructure/Clock.ts';
import type { IdGenerator } from '../infrastructure/IdGenerator.ts';
import type { PricingService } from './PricingService.ts';
import type { RoutePlanner } from './RoutePlanner.ts';
import type { NotificationService } from './NotificationService.ts';

/** One bookable combination of vehicles at one branch. */
export interface AvailabilityOption {
  readonly branchId: string;
  readonly branchName: string;
  readonly vehicles: readonly {
    readonly id: string;
    readonly registration: string;
    readonly type: string;
    readonly maxWeightKg: number;
    readonly loadFactorPercent: number;
  }[];
  readonly isSplitShipment: boolean;
  readonly routeLabel: string;
  readonly distanceKm: number;
  readonly estimatedHours: number;
  readonly priceDong: number;
  readonly priceFormatted: string;
}

export interface AvailabilityResult {
  readonly options: readonly AvailabilityOption[];
  readonly message: string;
  readonly alternativeCities: readonly string[];
}

/**
 * Business area 3 — Order Placement, Amendment and Cancellation
 * (Assignment 1 Tasks 4, 5 and 6).
 *
 * Part of change C1. This service owns the sequence that Assignment 2 spread
 * across `SmartFMSystem`, `Branch` and `Vehicle`: search across branches, hold
 * capacity, quote, and create the order. The *decisions* remain distributed —
 * `Vehicle.canCarry()` decides suitability, `CapacityHold` decides whether a
 * reservation is still valid, `ShipmentOrder` decides whether it may be amended
 * or cancelled — so this class coordinates without absorbing rules.
 *
 * The reserve-then-submit split (change C14) mirrors how a customer really
 * behaves: select an option, review the itemised quote, then either commit or
 * change their mind and release the hold.
 */
export class OrderService {
  private readonly orders: ShipmentOrderRepository;
  private readonly holds: CapacityHoldRepository;
  private readonly vehicles: VehicleRepository;
  private readonly branches: BranchRepository;
  private readonly customers: CustomerRepository;
  private readonly itineraries: ItineraryRepository;
  private readonly pricing: PricingService;
  private readonly routePlanner: RoutePlanner;
  private readonly notifications: NotificationService;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(dependencies: {
    orders: ShipmentOrderRepository;
    holds: CapacityHoldRepository;
    vehicles: VehicleRepository;
    branches: BranchRepository;
    customers: CustomerRepository;
    itineraries: ItineraryRepository;
    pricing: PricingService;
    routePlanner: RoutePlanner;
    notifications: NotificationService;
    clock: Clock;
    ids: IdGenerator;
  }) {
    this.orders = dependencies.orders;
    this.holds = dependencies.holds;
    this.vehicles = dependencies.vehicles;
    this.branches = dependencies.branches;
    this.customers = dependencies.customers;
    this.itineraries = dependencies.itineraries;
    this.pricing = dependencies.pricing;
    this.routePlanner = dependencies.routePlanner;
    this.notifications = dependencies.notifications;
    this.clock = dependencies.clock;
    this.ids = dependencies.ids;
  }

  // -------------------------------------------------- Task 4: check availability

  /**
   * Assignment 1 Task 4, including variant 3a (suggest alternatives when the
   * preferred branch has nothing) and variant 3b (search every branch when none
   * is specified).
   */
  async searchAvailability(input: {
    cargo: unknown;
    delivery: unknown;
    preferredBranchId?: unknown;
  }): Promise<AvailabilityResult> {
    const now = this.clock.now();
    const cargo = CargoDetails.create(input.cargo as never);
    const delivery = DeliveryDetails.create(input.delivery as never, now);

    if (!delivery.isServiceable()) {
      throw new RuleViolationError(
        'One of the addresses is outside the ABC-Trans service network. Choose a serviced city at both ends.',
      );
    }

    const route = await this.routePlanner.planRoute(delivery.pickupAddress.city, delivery.deliveryAddress.city);
    const window = delivery.serviceWindow();
    if (!route.fitsWithin(window.durationHours() * 60)) {
      throw new RuleViolationError(
        `The ${route.label()} run needs about ${route.estimatedDurationHours()} hours, but your delivery window is only ${Math.round(window.durationHours())} hours. Choose a later delivery deadline.`,
        { field: 'requiredDeliveryBy' },
      );
    }

    const blockedVehicleIds = await this.blockedVehicleIds(now, window);
    const branches = await this.branches.findOperational();
    const preferredBranchId = input.preferredBranchId === undefined ? undefined : String(input.preferredBranchId);

    const options: AvailabilityOption[] = [];
    for (const branch of branches) {
      const fleet = (await this.vehicles.findByBranch(branch.id)).filter(
        (vehicle) => vehicle.isAvailableDuring(window) && !blockedVehicleIds.has(vehicle.id),
      );
      const option = this.buildOption(branch.id, branch.label(), fleet, cargo, delivery, route);
      if (option !== undefined) {
        options.push(option);
      }
    }

    const preferred = options.filter((option) => option.branchId === preferredBranchId);
    const others = options.filter((option) => option.branchId !== preferredBranchId);
    const ordered = preferredBranchId === undefined ? options : [...preferred, ...others];

    return {
      options: ordered,
      message: OrderService.availabilityMessage(ordered.length, preferred.length, preferredBranchId),
      alternativeCities: [...new Set(others.map((option) => option.branchName))],
    };
  }

  /** Builds the best single-vehicle option, or a split combination if none fits. */
  private buildOption(
    branchId: string,
    branchName: string,
    fleet: readonly Vehicle[],
    cargo: CargoDetails,
    delivery: DeliveryDetails,
    route: Route,
  ): AvailabilityOption | undefined {
    const price = this.pricing.quoteTotal(cargo, delivery, route);

    // Prefer the smallest single vehicle that can take the whole load: a 24-tonne
    // container for a 300 kg pallet is available capacity wasted.
    const singles = fleet
      .filter((vehicle) => vehicle.canCarry(cargo))
      .sort((left, right) => left.maxWeightKg - right.maxWeightKg);

    const best = singles[0];
    if (best !== undefined) {
      return OrderService.toOption(branchId, branchName, [best], cargo, route, price, false);
    }

    // Assignment 1 Task 5 variant 5b: propose splitting across several vehicles.
    const split = OrderService.selectSplitCombination(fleet, cargo);
    if (split.length > 1) {
      return OrderService.toOption(branchId, branchName, split, cargo, route, price, true);
    }
    return undefined;
  }

  /** Largest-first greedy fill; refrigerated freight only rides refrigerated units. */
  private static selectSplitCombination(fleet: readonly Vehicle[], cargo: CargoDetails): Vehicle[] {
    const eligible = fleet
      .filter((vehicle) => cargo.handling !== 'REFRIGERATED' || vehicle.isRefrigerated)
      .sort((left, right) => right.maxWeightKg - left.maxWeightKg);

    const chosen: Vehicle[] = [];
    let remainingWeight = cargo.totalWeightKg;
    let remainingVolume = cargo.totalVolumeM3;

    for (const vehicle of eligible) {
      if (remainingWeight <= 0 && remainingVolume <= 0) {
        break;
      }
      chosen.push(vehicle);
      remainingWeight -= vehicle.maxWeightKg;
      remainingVolume -= vehicle.maxVolumeM3;
    }
    return remainingWeight <= 0 && remainingVolume <= 0 ? chosen : [];
  }

  private static toOption(
    branchId: string,
    branchName: string,
    vehicles: readonly Vehicle[],
    cargo: CargoDetails,
    route: Route,
    price: Money,
    isSplitShipment: boolean,
  ): AvailabilityOption {
    const totalCapacity = vehicles.reduce((sum, vehicle) => sum + vehicle.maxWeightKg, 0);
    return {
      branchId,
      branchName,
      isSplitShipment,
      routeLabel: route.label(),
      distanceKm: route.totalDistanceKm(),
      estimatedHours: route.estimatedDurationHours(),
      priceDong: price.amount,
      priceFormatted: price.format(),
      vehicles: vehicles.map((vehicle) => ({
        id: vehicle.id,
        registration: vehicle.registration,
        type: vehicle.type,
        maxWeightKg: vehicle.maxWeightKg,
        loadFactorPercent: Math.round(
          (isSplitShipment ? cargo.totalWeightKg / totalCapacity : vehicle.loadFactorFor(cargo)) * 100,
        ),
      })),
    };
  }

  private static availabilityMessage(total: number, preferred: number, preferredBranchId?: string): string {
    if (total === 0) {
      return 'No vehicle at any branch can carry this shipment in the requested window. Try a later delivery date, a smaller load, or contact ABC-Trans.';
    }
    if (preferredBranchId !== undefined && preferred === 0) {
      return `Your preferred branch has nothing available. ${total} option(s) were found at other branches.`;
    }
    return `${total} option(s) available.`;
  }

  /** Vehicles another customer already holds, or that are already on the road. */
  private async blockedVehicleIds(now: Date, window: ReturnType<DeliveryDetails['serviceWindow']>): Promise<Set<string>> {
    const blocked = new Set<string>();
    for (const hold of await this.holds.findActive(now)) {
      blocked.add(hold.vehicleId);
    }
    for (const itinerary of await this.itineraries.findLive()) {
      if (itinerary.window.overlaps(window)) {
        blocked.add(itinerary.vehicleId);
      }
    }
    return blocked;
  }

  // ------------------------------------------- Task 4/5: reserve, then commit

  /**
   * Takes a temporary hold on the chosen vehicles (change C14). Assignment 1
   * Task 4 subtask 5: the option is held while the customer proceeds, so a
   * competing customer cannot take it from under them.
   */
  async reserveCapacity(customerId: string, vehicleIds: readonly unknown[]): Promise<CapacityHold[]> {
    const now = this.clock.now();
    const customer = await this.customers.requireById(customerId, 'Customer');
    customer.assertUsable();

    Guard.require(Array.isArray(vehicleIds) && vehicleIds.length > 0, 'vehicleIds', 'Select at least one vehicle.');

    // Check every vehicle first, so a partly-successful reservation is impossible.
    const requested = vehicleIds.map((value) => String(value));
    for (const vehicleId of requested) {
      const vehicle = await this.vehicles.requireById(vehicleId, 'Vehicle');
      if (vehicle.status !== 'AVAILABLE') {
        throw new ConflictError(
          `${vehicle.label()} is no longer available. Please search again.`,
          { vehicleId },
        );
      }
      const existing = await this.holds.findActiveForVehicle(vehicleId, now);
      if (existing !== undefined && !existing.isHeldBy(customerId)) {
        throw new ConflictError(
          `${vehicle.label()} was just reserved by another customer. Please choose an alternative option.`,
          { vehicleId },
        );
      }
    }

    const created = requested.map(
      (vehicleId) =>
        new CapacityHold({ id: this.ids.next('hld'), vehicleId, customerId, heldFrom: now }),
    );
    await this.holds.saveAll(created);
    return created;
  }

  /**
   * Assignment 1 Task 4/5: the customer changed their mind before committing, so
   * the capacity goes straight back into the pool.
   */
  async releaseReservation(customerId: string, holdIds: readonly unknown[]): Promise<number> {
    const wanted = new Set(holdIds.map((value) => String(value)));
    const held = await this.holds.findActiveForCustomer(customerId, this.clock.now());
    const toRelease = held.filter((hold) => wanted.size === 0 || wanted.has(hold.id));

    for (const hold of toRelease) {
      hold.release();
    }
    await this.holds.saveAll(toRelease);
    return toRelease.length;
  }

  async activeReservations(customerId: string): Promise<CapacityHold[]> {
    return this.holds.findActiveForCustomer(customerId, this.clock.now());
  }

  /**
   * Assignment 1 Task 5: creates the confirmed, pending order.
   *
   * Every hold is validated before anything is written, so a race lost at the
   * last moment leaves no partial order behind — the postcondition Assignment 2's
   * Scenario 1 stated but could not enforce.
   */
  async placeOrder(
    customerId: string,
    input: { branchId: unknown; holdIds: readonly unknown[]; cargo: unknown; delivery: unknown },
  ): Promise<ShipmentOrder> {
    const now = this.clock.now();
    const customer = await this.customers.requireById(customerId, 'Customer');
    customer.assertUsable();

    const branch = await this.branches.requireById(String(input.branchId), 'Branch');
    if (!branch.isOperational()) {
      throw new RuleViolationError(`${branch.label()} is not currently accepting orders.`);
    }

    const cargo = CargoDetails.create(input.cargo as never);
    const delivery = DeliveryDetails.create(input.delivery as never, now);
    const route = await this.routePlanner.planRoute(delivery.pickupAddress.city, delivery.deliveryAddress.city);

    Guard.require(
      Array.isArray(input.holdIds) && input.holdIds.length > 0,
      'holdIds',
      'Reserve a vehicle before submitting the order.',
    );

    const holds: CapacityHold[] = [];
    for (const value of input.holdIds) {
      const hold = await this.holds.findById(String(value));
      if (hold === undefined) {
        throw new NotFoundError('Reservation', String(value));
      }
      if (!hold.isHeldBy(customerId)) {
        throw new ConflictError('That reservation belongs to another customer.');
      }
      hold.assertStillValid(now);
      const vehicle = await this.vehicles.requireById(hold.vehicleId, 'Vehicle');
      if (!vehicle.canCarry(cargo) && input.holdIds.length === 1) {
        throw new RuleViolationError(
          `${vehicle.label()} cannot carry ${cargo.totalWeightKg} kg of ${cargo.handling.toLowerCase()} freight. Search again with the final cargo details.`,
          { field: 'cargo' },
        );
      }
      holds.push(hold);
    }

    const order = new ShipmentOrder({
      id: this.ids.next('ord'),
      reference: this.ids.nextReference('SFM', now.getFullYear()),
      customerId,
      branchId: branch.id,
      cargo,
      delivery,
      quotedPrice: this.pricing.quoteTotal(cargo, delivery, route),
      placedAt: now,
    });
    order.registerObserver(this.notifications);

    for (const hold of holds) {
      hold.claim(order.id, now);
    }

    await this.orders.save(order);
    await this.holds.saveAll(holds);
    order.announcePlacement();
    return order;
  }

  // ------------------------------------------ Task 6: modify / cancel an order

  async listForCustomer(customerId: string): Promise<ShipmentOrder[]> {
    const orders = await this.orders.findByCustomer(customerId);
    for (const order of orders) {
      order.registerObserver(this.notifications);
    }
    return orders;
  }

  /** Assignment 1 Task 8 variant 1a: ownership is checked before anything is revealed. */
  async getForCustomer(customerId: string, orderId: string): Promise<ShipmentOrder> {
    const order = await this.orders.findById(orderId);
    if (order === undefined) {
      throw new NotFoundError('Shipment order', orderId);
    }
    order.assertOwnedBy(customerId);
    order.registerObserver(this.notifications);
    return order;
  }

  /** Assignment 1 Task 6 subtask 3: only unrestricted fields, only while modifiable. */
  async amendOrder(
    customerId: string,
    orderId: string,
    changes: {
      deliveryAddress?: unknown;
      requiredDeliveryBy?: unknown;
      recipientName?: unknown;
      recipientPhone?: unknown;
    },
  ): Promise<ShipmentOrder> {
    const order = await this.getForCustomer(customerId, orderId);
    const now = this.clock.now();

    order.amendDelivery(
      {
        ...(changes.deliveryAddress !== undefined
          ? { deliveryAddress: Address.create(changes.deliveryAddress as never, 'deliveryAddress') }
          : {}),
        ...(changes.requiredDeliveryBy !== undefined
          ? { requiredDeliveryBy: Guard.futureDate('requiredDeliveryBy', changes.requiredDeliveryBy, now) }
          : {}),
        ...(changes.recipientName !== undefined
          ? { recipientName: Guard.text('recipientName', changes.recipientName, 2, 100) }
          : {}),
        ...(changes.recipientPhone !== undefined
          ? { recipientPhone: Guard.phone('recipientPhone', changes.recipientPhone) }
          : {}),
      },
      'Customer',
      now,
    );

    // An amended destination changes the lane, so the quote is recomputed.
    if (changes.deliveryAddress !== undefined && order.invoiceId === undefined) {
      const route = await this.routePlanner.planRoute(
        order.delivery.pickupAddress.city,
        order.delivery.deliveryAddress.city,
      );
      order.reprice(this.pricing.quoteTotal(order.cargo, order.delivery, route), 'Customer', now);
    }

    return this.orders.save(order);
  }

  /**
   * Assignment 1 Task 6 subtasks 4-6, variant 5a. Cancelling also frees the
   * vehicles and drivers the order was holding, which is what stops a cancelled
   * order silently sterilising the fleet.
   */
  async cancelOrder(customerId: string, orderId: string, reason: unknown): Promise<ShipmentOrder> {
    const order = await this.getForCustomer(customerId, orderId);
    const now = this.clock.now();

    order.cancel('Customer', String(reason ?? 'Cancelled by customer'), now);

    const itineraries = await this.itineraries.findByOrder(orderId);
    for (const itinerary of itineraries) {
      if (itinerary.isLive()) {
        itinerary.cancel();
        const vehicle = await this.vehicles.findById(itinerary.vehicleId);
        vehicle?.release();
        if (vehicle !== undefined) {
          await this.vehicles.save(vehicle);
        }
      }
    }
    await this.itineraries.saveAll(itineraries);
    order.detachItineraries(now, 'Customer');

    const holds = await this.holds.findForOrder(orderId);
    for (const hold of holds) {
      hold.release();
    }
    await this.holds.saveAll(holds);

    return this.orders.save(order);
  }
}
