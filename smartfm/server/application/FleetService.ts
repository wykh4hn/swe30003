import { Vehicle } from '../domain/fleet/Vehicle.ts';
import type { VehicleType } from '../domain/fleet/Vehicle.ts';
import { Driver } from '../domain/people/Driver.ts';
import type { LicenceClass } from '../domain/people/Driver.ts';
import { Branch } from '../domain/fleet/Branch.ts';
import { ContactInfo } from '../domain/shared/ContactInfo.ts';
import { DateRange } from '../domain/shared/DateRange.ts';
import { Guard } from '../domain/shared/Guard.ts';
import { RuleViolationError, ValidationError } from '../domain/shared/DomainError.ts';
import type {
  BranchRepository,
  VehicleRepository,
} from '../infrastructure/persistence/FleetRepositories.ts';
import type { DriverRepository } from '../infrastructure/persistence/PeopleRepositories.ts';
import type { ShipmentOrderRepository } from '../infrastructure/persistence/OrderingRepositories.ts';
import type { Clock } from '../infrastructure/Clock.ts';
import type { IdGenerator } from '../infrastructure/IdGenerator.ts';
import type { AuthService } from './AuthService.ts';

/**
 * Business area 2 — Fleet and Driver Resource Management
 * (Assignment 1 Tasks 1 and 2).
 *
 * Part of change C1, and the service where change C3 pays off. Assignment 2 gave
 * `Branch` the responsibility to "find resources across branches matching cargo,
 * timing, route and operational constraints" — but a branch cannot see other
 * branches' fleets, so that responsibility was misplaced. It lives here, where
 * the repositories make a cross-branch query possible; the per-vehicle decisions
 * ("can this vehicle take this load?", "may this vehicle be retired?") stay on
 * `Vehicle`, where the facts are.
 */
export class FleetService {
  private readonly vehicles: VehicleRepository;
  private readonly drivers: DriverRepository;
  private readonly branches: BranchRepository;
  private readonly orders: ShipmentOrderRepository;
  private readonly auth: AuthService;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(dependencies: {
    vehicles: VehicleRepository;
    drivers: DriverRepository;
    branches: BranchRepository;
    orders: ShipmentOrderRepository;
    auth: AuthService;
    clock: Clock;
    ids: IdGenerator;
  }) {
    this.vehicles = dependencies.vehicles;
    this.drivers = dependencies.drivers;
    this.branches = dependencies.branches;
    this.orders = dependencies.orders;
    this.auth = dependencies.auth;
    this.clock = dependencies.clock;
    this.ids = dependencies.ids;
  }

  // ------------------------------------------------------------------ branches

  async listBranches(): Promise<Branch[]> {
    return this.branches.findAll();
  }

  async requireBranch(branchId: string): Promise<Branch> {
    return this.branches.requireById(branchId, 'Branch');
  }

  // ------------------------------------------------------------------ vehicles

  /** Assignment 1 Task 1 subtask 4. */
  async listVehicles(branchId?: string): Promise<Vehicle[]> {
    const found = branchId === undefined ? await this.vehicles.findAll() : await this.vehicles.findByBranch(branchId);
    return found.sort((left, right) => left.registration.localeCompare(right.registration));
  }

  /** Assignment 1 Task 1 subtask 1. Duplicate plates are rejected. */
  async registerVehicle(input: {
    registration: unknown;
    type: unknown;
    branchId: unknown;
    odometerKm?: unknown;
  }): Promise<Vehicle> {
    const branchId = Guard.text('branchId', input.branchId);
    await this.requireBranch(branchId);

    const registration = String(input.registration ?? '');
    const duplicate = await this.vehicles.findByRegistration(registration);
    if (duplicate !== undefined) {
      throw new ValidationError('registration', `A vehicle with registration ${duplicate.registration} is already on file.`);
    }

    const vehicle = new Vehicle({
      id: this.ids.next('veh'),
      registration,
      type: Guard.oneOf('type', input.type, [
        'VAN',
        'TRUCK_5T',
        'TRUCK_10T',
        'REEFER_5T',
        'CONTAINER_20FT',
      ] as const) as VehicleType,
      branchId,
      odometerKm: Number(input.odometerKm ?? 0),
    });
    return this.vehicles.save(vehicle);
  }

  /** Assignment 1 Task 1 subtask 2. */
  async updateVehicle(
    vehicleId: string,
    changes: { registration?: unknown; type?: unknown; odometerKm?: unknown },
  ): Promise<Vehicle> {
    const vehicle = await this.vehicles.requireById(vehicleId, 'Vehicle');

    if (changes.registration !== undefined) {
      const clash = await this.vehicles.findByRegistration(String(changes.registration));
      if (clash !== undefined && clash.id !== vehicle.id) {
        throw new ValidationError('registration', `Registration ${clash.registration} belongs to another vehicle.`);
      }
    }

    vehicle.updateDetails({
      ...(changes.registration !== undefined ? { registration: String(changes.registration) } : {}),
      ...(changes.type !== undefined ? { type: changes.type as VehicleType } : {}),
      ...(changes.odometerKm !== undefined ? { odometerKm: Number(changes.odometerKm) } : {}),
    });
    return this.vehicles.save(vehicle);
  }

  /** Assignment 1 Task 1 subtask 3 and variant 2a. */
  async sendVehicleToMaintenance(vehicleId: string, description: unknown, expectedReturn?: unknown): Promise<Vehicle> {
    const vehicle = await this.vehicles.requireById(vehicleId, 'Vehicle');
    const returnDate = expectedReturn === undefined || expectedReturn === '' ? undefined : Guard.date('expectedReturn', expectedReturn);
    vehicle.sendToMaintenance(Guard.text('description', description, 3, 200), this.clock.now(), returnDate);
    return this.vehicles.save(vehicle);
  }

  async returnVehicleToService(vehicleId: string): Promise<Vehicle> {
    const vehicle = await this.vehicles.requireById(vehicleId, 'Vehicle');
    vehicle.returnToService(this.clock.now());
    return this.vehicles.save(vehicle);
  }

  /** Change C3 made concrete: a vehicle moves between branches. */
  async transferVehicle(vehicleId: string, branchId: string): Promise<Vehicle> {
    const vehicle = await this.vehicles.requireById(vehicleId, 'Vehicle');
    await this.requireBranch(branchId);
    vehicle.transferTo(branchId);
    return this.vehicles.save(vehicle);
  }

  /**
   * Assignment 1 Task 1 subtask 5 and variant 5a. `Vehicle.retire()` refuses
   * while an itinerary is active; this method adds the wider check that no
   * pending order is still counting on the vehicle.
   */
  async retireVehicle(vehicleId: string): Promise<Vehicle> {
    const vehicle = await this.vehicles.requireById(vehicleId, 'Vehicle');
    vehicle.retire();
    return this.vehicles.save(vehicle);
  }

  async reinstateVehicle(vehicleId: string): Promise<Vehicle> {
    const vehicle = await this.vehicles.requireById(vehicleId, 'Vehicle');
    vehicle.reinstate();
    return this.vehicles.save(vehicle);
  }

  // ------------------------------------------------------------------- drivers

  /** Assignment 1 Task 2 subtask 4. */
  async listDrivers(branchId?: string): Promise<Driver[]> {
    const found = branchId === undefined ? await this.drivers.findAll() : await this.drivers.findByBranch(branchId);
    return found.sort((left, right) => left.fullName.localeCompare(right.fullName));
  }

  /** Assignment 1 Task 2 subtask 1. A driver also receives sign-in credentials. */
  async registerDriver(input: {
    fullName: unknown;
    email: unknown;
    phone: unknown;
    branchId: unknown;
    licenceNumber: unknown;
    licenceClass: unknown;
    password?: unknown;
  }): Promise<Driver> {
    const branchId = Guard.text('branchId', input.branchId);
    await this.requireBranch(branchId);

    const contact = ContactInfo.create({ email: input.email, phone: input.phone });
    const clash = await this.drivers.findOneWhere((driver) => driver.contact.email === contact.email);
    if (clash !== undefined) {
      throw new ValidationError('email', 'A driver with this email address is already on file.');
    }

    const driver = new Driver({
      id: this.ids.next('drv'),
      fullName: String(input.fullName ?? ''),
      contact,
      branchId,
      licenceNumber: String(input.licenceNumber ?? ''),
      licenceClass: Guard.oneOf('licenceClass', input.licenceClass, ['B2', 'C', 'D', 'E', 'FC'] as const) as LicenceClass,
    });

    await this.drivers.save(driver);
    await this.auth.createAccount({
      username: contact.email,
      password: input.password ?? 'driver1234',
      personId: driver.id,
      role: 'DRIVER',
      branchId,
    });
    return driver;
  }

  /** Assignment 1 Task 2 subtask 2. */
  async updateDriver(
    driverId: string,
    changes: { fullName?: unknown; email?: unknown; phone?: unknown; licenceNumber?: unknown; licenceClass?: unknown },
  ): Promise<Driver> {
    const driver = await this.drivers.requireById(driverId, 'Driver');

    if (changes.fullName !== undefined) {
      driver.rename(String(changes.fullName));
    }
    if (changes.email !== undefined || changes.phone !== undefined) {
      driver.updateContact(
        ContactInfo.create({
          email: changes.email ?? driver.contact.email,
          phone: changes.phone ?? driver.contact.phone,
        }),
      );
    }
    if (changes.licenceNumber !== undefined || changes.licenceClass !== undefined) {
      driver.updateQualifications(
        String(changes.licenceNumber ?? driver.licenceNumber),
        (changes.licenceClass ?? driver.licenceClass) as LicenceClass,
      );
    }
    return this.drivers.save(driver);
  }

  /** Assignment 1 Task 2 subtask 3 and variant 1a. */
  async recordDriverLeave(driverId: string, start: unknown, end: unknown): Promise<Driver> {
    const driver = await this.drivers.requireById(driverId, 'Driver');
    driver.goOnLeave(DateRange.create(start, end, 'leave'));
    return this.drivers.save(driver);
  }

  async endDriverLeave(driverId: string): Promise<Driver> {
    const driver = await this.drivers.requireById(driverId, 'Driver');
    driver.returnFromLeave();
    return this.drivers.save(driver);
  }

  async transferDriver(driverId: string, branchId: string): Promise<Driver> {
    const driver = await this.drivers.requireById(driverId, 'Driver');
    await this.requireBranch(branchId);
    driver.transferTo(branchId);
    return this.drivers.save(driver);
  }

  /** Assignment 1 Task 2 variant 3a: refused while an itinerary is open. */
  async deactivateDriver(driverId: string): Promise<Driver> {
    const driver = await this.drivers.requireById(driverId, 'Driver');
    driver.deactivate();
    return this.drivers.save(driver);
  }

  async reactivateDriver(driverId: string): Promise<Driver> {
    const driver = await this.drivers.requireById(driverId, 'Driver');
    driver.reactivate();
    return this.drivers.save(driver);
  }

  // ------------------------------------------------------------ branch closure

  /** Gathers the counts `Branch.close()` needs, then lets the branch decide. */
  async closeBranch(branchId: string): Promise<Branch> {
    const branch = await this.requireBranch(branchId);
    const vehicles = await this.vehicles.findByBranch(branchId);
    const drivers = await this.drivers.findByBranch(branchId);
    const openOrders = await this.orders.countOpenForBranch(branchId);

    branch.close(
      vehicles.filter((vehicle) => vehicle.status !== 'RETIRED').length,
      drivers.filter((driver) => driver.isActive).length,
      openOrders,
    );
    return this.branches.save(branch);
  }

  /** Used by dispatch to confirm a driver may legally operate a given vehicle. */
  async assertDriverQualified(driverId: string, vehicleId: string): Promise<void> {
    const driver = await this.drivers.requireById(driverId, 'Driver');
    const vehicle = await this.vehicles.requireById(vehicleId, 'Vehicle');
    if (!driver.qualifiesFor(vehicle.requiredLicenceClass())) {
      throw new RuleViolationError(
        `${driver.fullName} holds licence class ${driver.licenceClass}, but ${vehicle.label()} requires ${vehicle.requiredLicenceClass()}.`,
        { driverId, vehicleId },
      );
    }
  }
}
