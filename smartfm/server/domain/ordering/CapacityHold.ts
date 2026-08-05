import { Entity } from '../shared/Entity.ts';
import { ConflictError } from '../shared/DomainError.ts';

/** How long a vehicle stays reserved while the customer finishes ordering. */
export const HOLD_DURATION_MINUTES = 15;

/**
 * A short-lived reservation of one vehicle's capacity for one customer.
 *
 * Assignment 3 change C14 — a class the initial design needed but did not name.
 * Assignment 2's Scenario 1 step 5 said "selected capacity receives an atomic
 * temporary hold so a competing order cannot double-book it", and assumption A13
 * insisted the hold was "distinct from the final Route and Itinerary" — yet no
 * class owned it, so an implementer had to guess where that state lived. Making
 * it a first-class object is what allows Assignment 1 Task 4 variant 5a (the
 * concurrent-booking race) to be demonstrated rather than merely described.
 *
 * Implementation also corrected a detail the initial design got wrong. Assignment
 * 2 attached the hold to an *order*, but the hold exists precisely during the
 * window before an order is submitted — Assignment 1 Task 5 variant 5a describes
 * capacity "becoming unavailable between selection and submission". A hold is
 * therefore taken by a **customer** and only later *claimed* by the order that
 * results, or released when the customer changes their mind.
 *
 * The hold is deliberately *not* an `Itinerary`: it carries no driver, no route
 * and no schedule, and it expires on its own.
 */
export class CapacityHold extends Entity {
  readonly vehicleId: string;
  readonly customerId: string;
  readonly heldFrom: Date;
  readonly expiresAt: Date;
  private claimedByOrderId: string | undefined;
  private released: boolean;

  constructor(params: {
    id: string;
    vehicleId: string;
    customerId: string;
    heldFrom: Date;
    expiresAt?: Date;
    orderId?: string | undefined;
    released?: boolean;
  }) {
    super(params.id);
    this.vehicleId = params.vehicleId;
    this.customerId = params.customerId;
    this.heldFrom = params.heldFrom;
    this.expiresAt = params.expiresAt ?? new Date(params.heldFrom.getTime() + HOLD_DURATION_MINUTES * 60_000);
    this.claimedByOrderId = params.orderId;
    this.released = params.released ?? false;
  }

  get orderId(): string | undefined {
    return this.claimedByOrderId;
  }

  get isReleased(): boolean {
    return this.released;
  }

  isExpired(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  /** A hold blocks other customers only while it is unreleased and unexpired. */
  isActive(now: Date): boolean {
    return !this.released && !this.isExpired(now);
  }

  isHeldBy(customerId: string): boolean {
    return this.customerId === customerId;
  }

  /** Attaches the hold to the order that was finally submitted. */
  claim(orderId: string, now: Date): void {
    this.assertStillValid(now);
    this.claimedByOrderId = orderId;
  }

  /** Assignment 1 Task 4/5: the customer changed their mind, or the order was placed elsewhere. */
  release(): void {
    this.released = true;
  }

  minutesRemaining(now: Date): number {
    return Math.max(0, Math.ceil((this.expiresAt.getTime() - now.getTime()) / 60_000));
  }

  /** Assignment 1 Task 5 variant 5a: the hold must still be valid at submission. */
  assertStillValid(now: Date): void {
    if (this.released) {
      throw new ConflictError(
        'This reservation was released. Please search for availability again.',
        { vehicleId: this.vehicleId },
      );
    }
    if (this.isExpired(now)) {
      throw new ConflictError(
        `This reservation expired after ${HOLD_DURATION_MINUTES} minutes and the vehicle has been returned to the pool. Please search for availability again.`,
        { vehicleId: this.vehicleId },
      );
    }
  }
}
