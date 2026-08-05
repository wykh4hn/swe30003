import { Guard } from './Guard.ts';

/** Cities ABC-Trans currently serves. Used for route planning and address validation. */
export const SERVICED_CITIES = [
  'Ha Noi',
  'Hai Phong',
  'Da Nang',
  'Nha Trang',
  'Ho Chi Minh City',
  'Can Tho',
] as const;

export type ServicedCity = (typeof SERVICED_CITIES)[number];

/**
 * An immutable postal address.
 *
 * Assignment 3 change C11. Assignment 2 modelled pickup and delivery locations
 * as untyped strings inside `DeliveryDetails`, which made the "address cannot be
 * verified" alternate path of Assignment 1 Task 7 impossible to implement.
 * Restricting the city to the serviced network gives `isServiceable()` a
 * concrete meaning that the dispatch layer can act on.
 */
export class Address {
  readonly street: string;
  readonly district: string;
  readonly city: ServicedCity;

  private constructor(street: string, district: string, city: ServicedCity) {
    this.street = street;
    this.district = district;
    this.city = city;
  }

  static create(input: { street: unknown; district: unknown; city: unknown }, fieldPrefix = 'address'): Address {
    return Guard.collect(
      [
        () => Guard.text(`${fieldPrefix}.street`, input.street, 3, 120),
        () => Guard.text(`${fieldPrefix}.district`, input.district, 2, 80),
        () => Guard.oneOf(`${fieldPrefix}.city`, input.city, SERVICED_CITIES),
      ],
      () =>
        new Address(
          Guard.text(`${fieldPrefix}.street`, input.street, 3, 120),
          Guard.text(`${fieldPrefix}.district`, input.district, 2, 80),
          Guard.oneOf(`${fieldPrefix}.city`, input.city, SERVICED_CITIES),
        ),
    );
  }

  /** True when the address sits inside the branch network ABC-Trans can serve. */
  isServiceable(): boolean {
    return (SERVICED_CITIES as readonly string[]).includes(this.city);
  }

  isSameCityAs(other: Address): boolean {
    return this.city === other.city;
  }

  equals(other: Address): boolean {
    return this.street === other.street && this.district === other.district && this.city === other.city;
  }

  format(): string {
    return `${this.street}, ${this.district}, ${this.city}`;
  }
}
