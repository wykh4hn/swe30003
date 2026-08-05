import { Person } from './Person.ts';
import type { PersonRole } from './Person.ts';
import { ContactInfo } from '../shared/ContactInfo.ts';
import { DateRange } from '../shared/DateRange.ts';
import { Guard } from '../shared/Guard.ts';
import { RuleViolationError } from '../shared/DomainError.ts';

/** Vietnamese heavy-vehicle licence classes relevant to the ABC-Trans fleet. */
export const LICENCE_CLASSES = ['B2', 'C', 'D', 'E', 'FC'] as const;
export type LicenceClass = (typeof LICENCE_CLASSES)[number];

export const DRIVER_AVAILABILITY = ['AVAILABLE', 'ASSIGNED', 'ON_LEAVE', 'INACTIVE'] as const;
export type DriverAvailability = (typeof DRIVER_AVAILABILITY)[number];

/** Minimum licence class needed to operate each vehicle class. */
const LICENCE_RANK: Readonly<Record<LicenceClass, number>> = { B2: 1, C: 2, D: 3, E: 4, FC: 5 };

/**
 * Qualified employee assigned to vehicles and responsible for delivery progress.
 *
 * Assignment 3 change C3 is visible here: the driver holds a `branchId` rather
 * than being *contained* by a `Branch`. The marker rejected the Assignment 2
 * composition between Branch and Driver, and `transferTo()` is the concrete
 * reason it was wrong — a driver survives, and keeps their history, when the
 * branch that employs them closes or when they move between branches.
 *
 * Assignment 3 change C7 splits the Assignment 2 bundle "maintain
 * qualifications, leave periods, availability and active/inactive state" into
 * `qualifiesFor`, `goOnLeave`/`returnFromLeave`, `assignToDuty`/`releaseFromDuty`
 * and `deactivate`, each with its own collaborator.
 */
export class Driver extends Person {
  private driverBranchId: string;
  private driverLicenceNumber: string;
  private driverLicenceClass: LicenceClass;
  private driverAvailability: DriverAvailability;
  private driverLeave: DateRange | undefined;
  private driverActiveItineraryId: string | undefined;

  constructor(params: {
    id: string;
    fullName: string;
    contact: ContactInfo;
    branchId: string;
    licenceNumber: string;
    licenceClass: LicenceClass;
    availability?: DriverAvailability;
    leave?: DateRange | undefined;
    activeItineraryId?: string | undefined;
    active?: boolean;
  }) {
    super(params.id, params.fullName, params.contact, params.active ?? true);
    this.driverBranchId = Guard.text('branchId', params.branchId);
    this.driverLicenceNumber = Guard.text('licenceNumber', params.licenceNumber, 6, 20);
    this.driverLicenceClass = Guard.oneOf('licenceClass', params.licenceClass, LICENCE_CLASSES);
    this.driverAvailability = params.availability ?? 'AVAILABLE';
    this.driverLeave = params.leave;
    this.driverActiveItineraryId = params.activeItineraryId;
  }

  override role(): PersonRole {
    return 'DRIVER';
  }

  get branchId(): string {
    return this.driverBranchId;
  }

  get licenceNumber(): string {
    return this.driverLicenceNumber;
  }

  get licenceClass(): LicenceClass {
    return this.driverLicenceClass;
  }

  get availability(): DriverAvailability {
    return this.driverAvailability;
  }

  get leave(): DateRange | undefined {
    return this.driverLeave;
  }

  get activeItineraryId(): string | undefined {
    return this.driverActiveItineraryId;
  }

  /** Assignment 1 Task 2, subtask 2. */
  updateQualifications(licenceNumber: string, licenceClass: LicenceClass): void {
    this.driverLicenceNumber = Guard.text('licenceNumber', licenceNumber, 6, 20);
    this.driverLicenceClass = Guard.oneOf('licenceClass', licenceClass, LICENCE_CLASSES);
  }

  /** True when this driver's licence covers the class a vehicle requires. */
  qualifiesFor(requiredClass: LicenceClass): boolean {
    return LICENCE_RANK[this.driverLicenceClass] >= LICENCE_RANK[requiredClass];
  }

  /** Change C3: a driver outlives their branch, so employment can be reassigned. */
  transferTo(branchId: string): void {
    if (this.driverAvailability === 'ASSIGNED') {
      throw new RuleViolationError('A driver on an active itinerary cannot be transferred to another branch.');
    }
    this.driverBranchId = Guard.text('branchId', branchId);
  }

  /** Assignment 1 Task 2, variant 1a. */
  goOnLeave(period: DateRange): void {
    if (this.driverAvailability === 'ASSIGNED') {
      throw new RuleViolationError('Complete or reassign the active itinerary before recording leave.');
    }
    this.driverLeave = period;
    this.driverAvailability = 'ON_LEAVE';
  }

  returnFromLeave(): void {
    this.driverLeave = undefined;
    if (this.driverAvailability === 'ON_LEAVE') {
      this.driverAvailability = 'AVAILABLE';
    }
  }

  /** True when the driver is free and not on leave for the requested window. */
  isAvailableDuring(window: DateRange): boolean {
    if (!this.isActive || this.driverAvailability === 'INACTIVE') {
      return false;
    }
    if (this.driverAvailability === 'ASSIGNED') {
      return false;
    }
    if (this.driverLeave !== undefined && this.driverLeave.overlaps(window)) {
      return false;
    }
    return true;
  }

  assignToDuty(itineraryId: string): void {
    if (this.driverAvailability !== 'AVAILABLE') {
      throw new RuleViolationError(`Driver ${this.fullName} is ${this.driverAvailability.toLowerCase()} and cannot take a new itinerary.`);
    }
    this.driverActiveItineraryId = Guard.text('itineraryId', itineraryId);
    this.driverAvailability = 'ASSIGNED';
  }

  releaseFromDuty(): void {
    this.driverActiveItineraryId = undefined;
    if (this.driverAvailability === 'ASSIGNED') {
      this.driverAvailability = 'AVAILABLE';
    }
  }

  /** Assignment 1 Task 2, variant 3a: never deactivate a driver holding open work. */
  protected override assertCanDeactivate(): void {
    super.assertCanDeactivate();
    if (this.driverActiveItineraryId !== undefined) {
      throw new RuleViolationError(
        `Driver ${this.fullName} still has an active itinerary (${this.driverActiveItineraryId}). Complete or reassign it first.`,
        { itineraryId: this.driverActiveItineraryId },
      );
    }
  }

  override deactivate(): void {
    super.deactivate();
    this.driverAvailability = 'INACTIVE';
  }

  override reactivate(): void {
    super.reactivate();
    this.driverAvailability = 'AVAILABLE';
  }
}
