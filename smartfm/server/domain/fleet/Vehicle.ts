import { Entity } from '../shared/Entity.ts';
import { DateRange } from '../shared/DateRange.ts';
import { Guard } from '../shared/Guard.ts';
import { RuleViolationError } from '../shared/DomainError.ts';
import { MaintenanceRecord } from './MaintenanceRecord.ts';
import type { LicenceClass } from '../people/Driver.ts';
import type { CargoDetails } from '../ordering/CargoDetails.ts';

export const VEHICLE_TYPES = ['VAN', 'TRUCK_5T', 'TRUCK_10T', 'REEFER_5T', 'CONTAINER_20FT'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_STATUSES = ['AVAILABLE', 'ASSIGNED', 'IN_MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

/** Fixed engineering facts per vehicle type: capacity, licence required, refrigeration. */
const TYPE_SPECIFICATION: Readonly<
  Record<VehicleType, { maxWeightKg: number; maxVolumeM3: number; licence: LicenceClass; refrigerated: boolean }>
> = {
  VAN: { maxWeightKg: 1_500, maxVolumeM3: 8, licence: 'B2', refrigerated: false },
  TRUCK_5T: { maxWeightKg: 5_000, maxVolumeM3: 24, licence: 'C', refrigerated: false },
  TRUCK_10T: { maxWeightKg: 10_000, maxVolumeM3: 45, licence: 'C', refrigerated: false },
  REEFER_5T: { maxWeightKg: 5_000, maxVolumeM3: 22, licence: 'C', refrigerated: true },
  CONTAINER_20FT: { maxWeightKg: 24_000, maxVolumeM3: 33, licence: 'FC', refrigerated: false },
};

/**
 * Transport resource whose capacity and operational state constrain assignment.
 *
 * Assignment 3 change C3 in action: a `Vehicle` references its managing branch
 * by identity and can be transferred, so `Branch` aggregates vehicles rather
 * than composing them. The marker rejected the Assignment 2 composition, and
 * `transferTo()` shows why it was wrong — a vehicle's lifetime is independent of
 * any one branch's.
 *
 * Assignment 2 non-change N4 confirmed: vehicle *type* remains data, not a
 * subclass hierarchy. The type table above varies only values, never behaviour,
 * so `Truck extends Vehicle` would add classes without adding polymorphism.
 */
export class Vehicle extends Entity {
  private vehicleRegistration: string;
  private vehicleType: VehicleType;
  private vehicleBranchId: string;
  private vehicleStatus: VehicleStatus;
  private vehicleOdometerKm: number;
  private vehicleAvailableFrom: Date | undefined;
  private vehicleActiveItineraryId: string | undefined;
  private readonly vehicleMaintenanceLog: MaintenanceRecord[];

  constructor(params: {
    id: string;
    registration: string;
    type: VehicleType;
    branchId: string;
    status?: VehicleStatus;
    odometerKm?: number;
    availableFrom?: Date | undefined;
    activeItineraryId?: string | undefined;
    maintenanceLog?: MaintenanceRecord[];
  }) {
    super(params.id);
    this.vehicleRegistration = Vehicle.normaliseRegistration(params.registration);
    this.vehicleType = Guard.oneOf('type', params.type, VEHICLE_TYPES);
    this.vehicleBranchId = Guard.text('branchId', params.branchId);
    this.vehicleStatus = params.status ?? 'AVAILABLE';
    this.vehicleOdometerKm = Guard.number('odometerKm', params.odometerKm ?? 0, 0, 5_000_000);
    this.vehicleAvailableFrom = params.availableFrom;
    this.vehicleActiveItineraryId = params.activeItineraryId;
    this.vehicleMaintenanceLog = params.maintenanceLog ?? [];
  }

  /** Vietnamese plate format, e.g. "51C-123.45"; stored uppercase without spaces. */
  private static normaliseRegistration(value: unknown): string {
    const text = Guard.text('registration', value, 6, 15).toUpperCase().replace(/\s+/g, '');
    if (!/^[0-9]{2}[A-Z]{1,2}-[0-9]{3}\.?[0-9]{2}$/.test(text)) {
      throw new RuleViolationError(
        `Registration '${text}' is not a valid Vietnamese plate. Expected a format such as 51C-123.45.`,
        { field: 'registration' },
      );
    }
    return text;
  }

  get registration(): string {
    return this.vehicleRegistration;
  }

  get type(): VehicleType {
    return this.vehicleType;
  }

  get branchId(): string {
    return this.vehicleBranchId;
  }

  get status(): VehicleStatus {
    return this.vehicleStatus;
  }

  get odometerKm(): number {
    return this.vehicleOdometerKm;
  }

  get availableFrom(): Date | undefined {
    return this.vehicleAvailableFrom;
  }

  get activeItineraryId(): string | undefined {
    return this.vehicleActiveItineraryId;
  }

  get maintenanceLog(): readonly MaintenanceRecord[] {
    return this.vehicleMaintenanceLog;
  }

  get maxWeightKg(): number {
    return TYPE_SPECIFICATION[this.vehicleType].maxWeightKg;
  }

  get maxVolumeM3(): number {
    return TYPE_SPECIFICATION[this.vehicleType].maxVolumeM3;
  }

  get isRefrigerated(): boolean {
    return TYPE_SPECIFICATION[this.vehicleType].refrigerated;
  }

  /** The minimum driver licence class needed to operate this vehicle. */
  requiredLicenceClass(): LicenceClass {
    return TYPE_SPECIFICATION[this.vehicleType].licence;
  }

  /**
   * Assignment 1 Task 4/5: can this vehicle physically take the load?
   * The vehicle answers, because the vehicle owns its capacity facts.
   */
  canCarry(cargo: CargoDetails): boolean {
    if (cargo.totalWeightKg > this.maxWeightKg) {
      return false;
    }
    if (cargo.totalVolumeM3 > this.maxVolumeM3) {
      return false;
    }
    if (cargo.handling === 'REFRIGERATED' && !this.isRefrigerated) {
      return false;
    }
    return true;
  }

  /** How much of this vehicle's weight capacity a load would consume, 0..1. */
  loadFactorFor(cargo: CargoDetails): number {
    return Math.min(1, cargo.totalWeightKg / this.maxWeightKg);
  }

  isOperational(): boolean {
    return this.vehicleStatus === 'AVAILABLE' || this.vehicleStatus === 'ASSIGNED';
  }

  /** Assignment 1 Task 1 variant 2a: long-term maintenance publishes a future availability date. */
  isAvailableDuring(window: DateRange): boolean {
    if (this.vehicleStatus !== 'AVAILABLE') {
      return false;
    }
    if (this.vehicleAvailableFrom !== undefined && this.vehicleAvailableFrom.getTime() > window.start.getTime()) {
      return false;
    }
    return true;
  }

  /** Assignment 1 Task 1 subtask 2. */
  updateDetails(changes: { registration?: string; type?: VehicleType; odometerKm?: number }): void {
    if (changes.registration !== undefined) {
      this.vehicleRegistration = Vehicle.normaliseRegistration(changes.registration);
    }
    if (changes.type !== undefined) {
      if (this.vehicleStatus === 'ASSIGNED') {
        throw new RuleViolationError('Vehicle type cannot be changed while the vehicle is on an active itinerary.');
      }
      this.vehicleType = Guard.oneOf('type', changes.type, VEHICLE_TYPES);
    }
    if (changes.odometerKm !== undefined) {
      const reading = Guard.number('odometerKm', changes.odometerKm, 0, 5_000_000);
      if (reading < this.vehicleOdometerKm) {
        throw new RuleViolationError(
          `Odometer cannot decrease. Current reading is ${this.vehicleOdometerKm} km.`,
          { field: 'odometerKm' },
        );
      }
      this.vehicleOdometerKm = reading;
    }
  }

  /** Change C3: a vehicle can move between branches, so Branch cannot own its lifetime. */
  transferTo(branchId: string): void {
    if (this.vehicleStatus === 'ASSIGNED') {
      throw new RuleViolationError('A vehicle on an active itinerary cannot be transferred to another branch.');
    }
    this.vehicleBranchId = Guard.text('branchId', branchId);
  }

  /** Assignment 1 Task 1 subtask 3 / variant 2a. */
  sendToMaintenance(description: string, now: Date, expectedReturn?: Date): void {
    if (this.vehicleStatus === 'ASSIGNED') {
      throw new RuleViolationError(
        'This vehicle is on an active itinerary. Complete or reassign the itinerary before booking maintenance.',
      );
    }
    this.vehicleMaintenanceLog.push(MaintenanceRecord.create({ recordedAt: now, description }));
    this.vehicleStatus = 'IN_MAINTENANCE';
    this.vehicleAvailableFrom = expectedReturn;
  }

  returnToService(now: Date): void {
    if (this.vehicleStatus !== 'IN_MAINTENANCE' && this.vehicleStatus !== 'OUT_OF_SERVICE') {
      throw new RuleViolationError('Only a vehicle in maintenance or out of service can be returned to service.');
    }
    const lastIndex = this.vehicleMaintenanceLog.length - 1;
    const last = this.vehicleMaintenanceLog[lastIndex];
    if (last !== undefined && last.isOpen()) {
      this.vehicleMaintenanceLog[lastIndex] = last.closedAt(now);
    }
    this.vehicleStatus = 'AVAILABLE';
    this.vehicleAvailableFrom = undefined;
  }

  reserveFor(itineraryId: string): void {
    if (this.vehicleStatus !== 'AVAILABLE') {
      throw new RuleViolationError(
        `Vehicle ${this.vehicleRegistration} is ${this.vehicleStatus.toLowerCase().replace('_', ' ')} and cannot be assigned.`,
      );
    }
    this.vehicleActiveItineraryId = Guard.text('itineraryId', itineraryId);
    this.vehicleStatus = 'ASSIGNED';
  }

  release(distanceTravelledKm = 0): void {
    this.vehicleOdometerKm += Math.max(0, Math.round(distanceTravelledKm));
    this.vehicleActiveItineraryId = undefined;
    if (this.vehicleStatus === 'ASSIGNED') {
      this.vehicleStatus = 'AVAILABLE';
    }
  }

  /**
   * Assignment 1 Task 1 variant 5a: soft delete only, and never while the
   * vehicle is committed to work.
   */
  retire(): void {
    if (this.vehicleStatus === 'ASSIGNED' || this.vehicleActiveItineraryId !== undefined) {
      throw new RuleViolationError(
        `Vehicle ${this.vehicleRegistration} is on an active itinerary and cannot be retired. Complete the delivery first.`,
        { itineraryId: this.vehicleActiveItineraryId ?? '' },
      );
    }
    this.vehicleStatus = 'RETIRED';
  }

  reinstate(): void {
    if (this.vehicleStatus !== 'RETIRED') {
      throw new RuleViolationError('Only a retired vehicle can be reinstated.');
    }
    this.vehicleStatus = 'AVAILABLE';
  }

  label(): string {
    return `${this.vehicleRegistration} (${this.vehicleType.replace('_', ' ')})`;
  }
}
