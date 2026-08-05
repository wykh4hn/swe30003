import { Entity } from '../shared/Entity.ts';
import { Guard } from '../shared/Guard.ts';
import { SERVICED_CITIES } from '../shared/Address.ts';

export const TRACKING_STATES = [
  'PICKED_UP',
  'IN_TRANSIT',
  'AT_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELAYED',
  'FAILED_ATTEMPT',
] as const;

export type TrackingState = (typeof TRACKING_STATES)[number];

/**
 * One immutable checkpoint in a shipment's timeline.
 *
 * Assignment 2 non-change N3, confirmed by implementation: assumption A8 said
 * tracking is "an ordered history of immutable updates rather than one
 * overwritten location field", and that held up. Every field is `readonly` and
 * the class exposes no mutator, so the audit trail cannot be rewritten — which
 * is what Assignment 1 Task 8 variant 2a (a revised ETA on a delayed shipment)
 * needs in order to stay honest: a delay *appends*, it does not overwrite.
 *
 * `ShipmentOrder` composes its updates; they are meaningless without the order.
 */
export class TrackingUpdate extends Entity {
  readonly orderId: string;
  readonly itineraryId: string;
  readonly recordedByDriverId: string;
  readonly recordedAt: Date;
  readonly state: TrackingState;
  readonly locationLabel: string;
  readonly estimatedArrival: Date | undefined;
  readonly note: string | undefined;

  private constructor(params: {
    id: string;
    orderId: string;
    itineraryId: string;
    recordedByDriverId: string;
    recordedAt: Date;
    state: TrackingState;
    locationLabel: string;
    estimatedArrival: Date | undefined;
    note: string | undefined;
  }) {
    super(params.id);
    this.orderId = params.orderId;
    this.itineraryId = params.itineraryId;
    this.recordedByDriverId = params.recordedByDriverId;
    this.recordedAt = params.recordedAt;
    this.state = params.state;
    this.locationLabel = params.locationLabel;
    this.estimatedArrival = params.estimatedArrival;
    this.note = params.note;
    Object.freeze(this);
  }

  static create(input: {
    id: string;
    orderId: string;
    itineraryId: string;
    recordedByDriverId: string;
    recordedAt: Date;
    state: unknown;
    locationLabel: unknown;
    estimatedArrival?: unknown;
    note?: unknown;
  }): TrackingUpdate {
    return Guard.collect(
      [
        () => Guard.oneOf('state', input.state, TRACKING_STATES),
        () => Guard.text('locationLabel', input.locationLabel, 2, 120),
        () => {
          if (input.estimatedArrival !== undefined && input.estimatedArrival !== null && input.estimatedArrival !== '') {
            Guard.date('estimatedArrival', input.estimatedArrival);
          }
        },
      ],
      () =>
        new TrackingUpdate({
          id: input.id,
          orderId: input.orderId,
          itineraryId: input.itineraryId,
          recordedByDriverId: input.recordedByDriverId,
          recordedAt: input.recordedAt,
          state: Guard.oneOf('state', input.state, TRACKING_STATES),
          locationLabel: Guard.text('locationLabel', input.locationLabel, 2, 120),
          estimatedArrival:
            input.estimatedArrival === undefined || input.estimatedArrival === null || input.estimatedArrival === ''
              ? undefined
              : Guard.date('estimatedArrival', input.estimatedArrival),
          note: Guard.optionalText('note', input.note, 300),
        }),
    );
  }

  /** Reconstructs a stored update. Used only by the persistence layer. */
  static rehydrate(params: {
    id: string;
    orderId: string;
    itineraryId: string;
    recordedByDriverId: string;
    recordedAt: Date;
    state: TrackingState;
    locationLabel: string;
    estimatedArrival: Date | undefined;
    note: string | undefined;
  }): TrackingUpdate {
    return new TrackingUpdate(params);
  }

  isAfter(other: TrackingUpdate): boolean {
    return this.recordedAt.getTime() >= other.recordedAt.getTime();
  }

  /** Assignment 1 Task 8 variant 2b: does this checkpoint end the delivery? */
  isTerminal(): boolean {
    return this.state === 'DELIVERED';
  }

  /** Plain-language wording for the customer timeline. */
  describe(): string {
    switch (this.state) {
      case 'PICKED_UP':
        return `Picked up at ${this.locationLabel}`;
      case 'IN_TRANSIT':
        return `In transit near ${this.locationLabel}`;
      case 'AT_HUB':
        return `Arrived at ${this.locationLabel} hub`;
      case 'OUT_FOR_DELIVERY':
        return `Out for delivery in ${this.locationLabel}`;
      case 'DELIVERED':
        return `Delivered at ${this.locationLabel}`;
      case 'DELAYED':
        return `Delayed at ${this.locationLabel}${this.note ? ` — ${this.note}` : ''}`;
      case 'FAILED_ATTEMPT':
        return `Delivery attempt failed at ${this.locationLabel}${this.note ? ` — ${this.note}` : ''}`;
      default:
        return this.locationLabel;
    }
  }

  /** Location labels offered to drivers in the mobile view. */
  static suggestedLocations(): readonly string[] {
    return SERVICED_CITIES;
  }
}
