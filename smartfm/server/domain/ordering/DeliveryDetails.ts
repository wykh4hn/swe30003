import { Address } from '../shared/Address.ts';
import { DateRange } from '../shared/DateRange.ts';
import { Guard } from '../shared/Guard.ts';

export const SERVICE_LEVELS = ['STANDARD', 'EXPRESS', 'SAME_DAY'] as const;
export type ServiceLevel = (typeof SERVICE_LEVELS)[number];

/**
 * Where the goods are collected and delivered, and when.
 *
 * Assignment 3 change C11: pickup and delivery are now `Address` value objects
 * rather than free text, which is what makes Assignment 1 Task 7's "delivery
 * address cannot be verified" path implementable — see `isServiceable()`.
 *
 * Composition by `ShipmentOrder` is retained (non-change N2), and the object is
 * immutable so that an amendment is always a recorded replacement.
 */
export class DeliveryDetails {
  readonly pickupAddress: Address;
  readonly deliveryAddress: Address;
  readonly requestedPickupAt: Date;
  readonly requiredDeliveryBy: Date;
  readonly serviceLevel: ServiceLevel;
  readonly recipientName: string;
  readonly recipientPhone: string;

  private constructor(params: {
    pickupAddress: Address;
    deliveryAddress: Address;
    requestedPickupAt: Date;
    requiredDeliveryBy: Date;
    serviceLevel: ServiceLevel;
    recipientName: string;
    recipientPhone: string;
  }) {
    this.pickupAddress = params.pickupAddress;
    this.deliveryAddress = params.deliveryAddress;
    this.requestedPickupAt = params.requestedPickupAt;
    this.requiredDeliveryBy = params.requiredDeliveryBy;
    this.serviceLevel = params.serviceLevel;
    this.recipientName = params.recipientName;
    this.recipientPhone = params.recipientPhone;
  }

  static create(
    input: {
      pickupAddress: unknown;
      deliveryAddress: unknown;
      requestedPickupAt: unknown;
      requiredDeliveryBy: unknown;
      serviceLevel: unknown;
      recipientName: unknown;
      recipientPhone: unknown;
    },
    now: Date,
  ): DeliveryDetails {
    const pickup = Address.create(input.pickupAddress as never, 'pickupAddress');
    const delivery = Address.create(input.deliveryAddress as never, 'deliveryAddress');

    return Guard.collect(
      [
        () => Guard.futureDate('requestedPickupAt', input.requestedPickupAt, now),
        () => Guard.date('requiredDeliveryBy', input.requiredDeliveryBy),
        () => Guard.oneOf('serviceLevel', input.serviceLevel, SERVICE_LEVELS),
        () => Guard.text('recipientName', input.recipientName, 2, 100),
        () => Guard.phone('recipientPhone', input.recipientPhone),
        () =>
          Guard.after(
            'requiredDeliveryBy',
            Guard.date('requiredDeliveryBy', input.requiredDeliveryBy),
            Guard.date('requestedPickupAt', input.requestedPickupAt),
            'the requested pickup time',
          ),
      ],
      () =>
        new DeliveryDetails({
          pickupAddress: pickup,
          deliveryAddress: delivery,
          requestedPickupAt: Guard.futureDate('requestedPickupAt', input.requestedPickupAt, now),
          requiredDeliveryBy: Guard.date('requiredDeliveryBy', input.requiredDeliveryBy),
          serviceLevel: Guard.oneOf('serviceLevel', input.serviceLevel, SERVICE_LEVELS),
          recipientName: Guard.text('recipientName', input.recipientName, 2, 100),
          recipientPhone: Guard.phone('recipientPhone', input.recipientPhone),
        }),
    );
  }

  /**
   * Rebuilds stored details without re-running the "pickup must be in the
   * future" check — a delivered order's pickup date is necessarily in the past.
   * Used only by the persistence layer.
   */
  static rehydrate(params: {
    pickupAddress: Address;
    deliveryAddress: Address;
    requestedPickupAt: Date;
    requiredDeliveryBy: Date;
    serviceLevel: ServiceLevel;
    recipientName: string;
    recipientPhone: string;
  }): DeliveryDetails {
    return new DeliveryDetails(params);
  }

  /** Assignment 1 Task 7 variant 3c: both ends must sit inside the branch network. */
  isServiceable(): boolean {
    return this.pickupAddress.isServiceable() && this.deliveryAddress.isServiceable();
  }

  /** The window a vehicle and driver must be free for. */
  serviceWindow(): DateRange {
    return DateRange.create(this.requestedPickupAt, this.requiredDeliveryBy, 'serviceWindow');
  }

  /** Multiplier applied by `PricingService`; faster service costs more. */
  serviceLevelMultiplier(): number {
    switch (this.serviceLevel) {
      case 'STANDARD':
        return 1;
      case 'EXPRESS':
        return 1.4;
      case 'SAME_DAY':
        return 1.9;
      default:
        return 1;
    }
  }

  /** Produces an amended copy; the original is never mutated. */
  amended(changes: {
    deliveryAddress?: Address;
    requiredDeliveryBy?: Date;
    recipientName?: string;
    recipientPhone?: string;
  }): DeliveryDetails {
    return new DeliveryDetails({
      pickupAddress: this.pickupAddress,
      deliveryAddress: changes.deliveryAddress ?? this.deliveryAddress,
      requestedPickupAt: this.requestedPickupAt,
      requiredDeliveryBy: changes.requiredDeliveryBy ?? this.requiredDeliveryBy,
      serviceLevel: this.serviceLevel,
      recipientName: changes.recipientName ?? this.recipientName,
      recipientPhone: changes.recipientPhone ?? this.recipientPhone,
    });
  }

  summary(): string {
    return `${this.pickupAddress.city} -> ${this.deliveryAddress.city} (${this.serviceLevel})`;
  }
}
