import { Guard } from './Guard.ts';

/**
 * Immutable email + phone pair.
 *
 * Assignment 3 change C8. The Assignment 2 CRC card for `Customer` listed
 * `Person` as a collaborator for the "maintain contact details" responsibility,
 * which the marker correctly rejected: a superclass is not a collaborator.
 * `ContactInfo` is the object `Customer`, `Driver` and `Branch` genuinely
 * collaborate with to hold and validate contact facts.
 */
export class ContactInfo {
  readonly email: string;
  readonly phone: string;

  private constructor(email: string, phone: string) {
    this.email = email;
    this.phone = phone;
  }

  static create(input: { email: unknown; phone: unknown }, fieldPrefix = 'contact'): ContactInfo {
    return Guard.collect(
      [
        () => Guard.email(`${fieldPrefix}.email`, input.email),
        () => Guard.phone(`${fieldPrefix}.phone`, input.phone),
      ],
      () =>
        new ContactInfo(
          Guard.email(`${fieldPrefix}.email`, input.email),
          Guard.phone(`${fieldPrefix}.phone`, input.phone),
        ),
    );
  }

  equals(other: ContactInfo): boolean {
    return this.email === other.email && this.phone === other.phone;
  }

  format(): string {
    return `${this.email} / ${this.phone}`;
  }
}
