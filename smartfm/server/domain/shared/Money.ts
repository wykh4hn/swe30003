import { ValidationError } from './DomainError.ts';

/**
 * An immutable monetary amount in Vietnamese dong.
 *
 * Assignment 3 change C11: the Assignment 2 design passed prices around as bare
 * numbers. Amounts are stored as whole dong (the smallest circulating unit) so
 * that invoice totals, payment amounts and report revenue can never drift apart
 * through floating-point rounding.
 */
export class Money {
  static readonly CURRENCY = 'VND';

  private readonly amountInDong: number;

  private constructor(amountInDong: number) {
    this.amountInDong = amountInDong;
  }

  /** Builds an amount, rejecting anything that is not a non-negative whole number of dong. */
  static of(amount: number, field = 'amount'): Money {
    if (!Number.isFinite(amount)) {
      throw new ValidationError(field, `${field} must be a number.`);
    }
    if (amount < 0) {
      throw new ValidationError(field, `${field} cannot be negative.`);
    }
    return new Money(Math.round(amount));
  }

  static zero(): Money {
    return new Money(0);
  }

  static sum(amounts: readonly Money[]): Money {
    return amounts.reduce((total, next) => total.plus(next), Money.zero());
  }

  get amount(): number {
    return this.amountInDong;
  }

  plus(other: Money): Money {
    return new Money(this.amountInDong + other.amountInDong);
  }

  minus(other: Money): Money {
    return Money.of(this.amountInDong - other.amountInDong);
  }

  times(factor: number): Money {
    return Money.of(this.amountInDong * factor);
  }

  isZero(): boolean {
    return this.amountInDong === 0;
  }

  isLessThan(other: Money): boolean {
    return this.amountInDong < other.amountInDong;
  }

  equals(other: Money): boolean {
    return this.amountInDong === other.amountInDong;
  }

  /** Display form used by invoices, receipts and the user interface. */
  format(): string {
    return `${this.amountInDong.toLocaleString('en-US')} ${Money.CURRENCY}`;
  }

  toJSON(): number {
    return this.amountInDong;
  }
}
