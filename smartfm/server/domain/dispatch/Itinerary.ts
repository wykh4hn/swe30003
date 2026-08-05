import { Entity } from '../shared/Entity.ts';
import { DateRange } from '../shared/DateRange.ts';
import { Guard } from '../shared/Guard.ts';
import { RuleViolationError } from '../shared/DomainError.ts';

export const ITINERARY_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type ItineraryStatus = (typeof ITINERARY_STATUSES)[number];

/**
 * One scheduled leg of work: this vehicle, this driver, this route, this window.
 *
 * Assignment 3 change C5 — the second composition the marker rejected. An
 * itinerary binds resources the *branch* owns, and it must outlive the order so
 * that `ResourceUtilisationReport` can still measure how hard a vehicle worked
 * last quarter. `ShipmentOrder` therefore aggregates itineraries by identity.
 *
 * Change C6 gives the itinerary the structure Assignment 2 lacked: an explicit
 * status, a scheduled `DateRange`, and the share of cargo this leg carries —
 * without which Assignment 1 Task 5 variant 5b (splitting a load across several
 * vehicles) cannot be represented at all.
 *
 * `conflictsWith()` is the rule that makes double-booking impossible; it lives
 * here because the itinerary is the only object that knows both the resources
 * and the window they are committed for.
 */
export class Itinerary extends Entity {
  readonly orderId: string;
  readonly branchId: string;
  readonly vehicleId: string;
  readonly driverId: string;
  readonly routeId: string;
  readonly legNumber: number;
  readonly assignedWeightKg: number;
  private itineraryWindow: DateRange;
  private itineraryStatus: ItineraryStatus;
  private itineraryCompletedAt: Date | undefined;

  constructor(params: {
    id: string;
    orderId: string;
    branchId: string;
    vehicleId: string;
    driverId: string;
    routeId: string;
    legNumber: number;
    assignedWeightKg: number;
    window: DateRange;
    status?: ItineraryStatus;
    completedAt?: Date | undefined;
  }) {
    super(params.id);
    this.orderId = params.orderId;
    this.branchId = params.branchId;
    this.vehicleId = params.vehicleId;
    this.driverId = params.driverId;
    this.routeId = params.routeId;
    this.legNumber = Guard.positiveInteger('legNumber', params.legNumber, 20);
    this.assignedWeightKg = Guard.positive('assignedWeightKg', params.assignedWeightKg, 24_000);
    this.itineraryWindow = params.window;
    this.itineraryStatus = params.status ?? 'PLANNED';
    this.itineraryCompletedAt = params.completedAt;
  }

  get window(): DateRange {
    return this.itineraryWindow;
  }

  get status(): ItineraryStatus {
    return this.itineraryStatus;
  }

  get completedAt(): Date | undefined {
    return this.itineraryCompletedAt;
  }

  isLive(): boolean {
    return this.itineraryStatus === 'PLANNED' || this.itineraryStatus === 'ACTIVE';
  }

  /**
   * Two itineraries clash when they commit the same vehicle or the same driver
   * to overlapping windows. Only live itineraries can clash — a completed or
   * cancelled one holds nothing.
   */
  conflictsWith(other: Itinerary): boolean {
    if (this.equals(other) || !this.isLive() || !other.isLive()) {
      return false;
    }
    const sharesResource = this.vehicleId === other.vehicleId || this.driverId === other.driverId;
    return sharesResource && this.itineraryWindow.overlaps(other.itineraryWindow);
  }

  activate(): void {
    if (this.itineraryStatus !== 'PLANNED') {
      throw new RuleViolationError(`Itinerary ${this.id} is ${this.itineraryStatus.toLowerCase()} and cannot be activated.`);
    }
    this.itineraryStatus = 'ACTIVE';
  }

  complete(now: Date): void {
    if (!this.isLive()) {
      throw new RuleViolationError(`Itinerary ${this.id} is already ${this.itineraryStatus.toLowerCase()}.`);
    }
    this.itineraryStatus = 'COMPLETED';
    this.itineraryCompletedAt = now;
  }

  cancel(): void {
    if (this.itineraryStatus === 'COMPLETED') {
      throw new RuleViolationError('A completed itinerary cannot be cancelled.');
    }
    this.itineraryStatus = 'CANCELLED';
  }

  reschedule(window: DateRange): void {
    if (this.itineraryStatus !== 'PLANNED') {
      throw new RuleViolationError('Only a planned itinerary can be rescheduled.');
    }
    this.itineraryWindow = window;
  }

  /** Hours this itinerary occupied its resources; feeds resource-utilisation reporting. */
  committedHours(): number {
    return Math.round(this.itineraryWindow.durationHours() * 10) / 10;
  }

  label(): string {
    return `Leg ${this.legNumber} — ${this.assignedWeightKg} kg — ${this.itineraryWindow.format()} [${this.itineraryStatus}]`;
  }
}
