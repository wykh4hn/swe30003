import { PaymentMethod } from './PaymentMethod.ts';
import type { PaymentMethodKind } from './PaymentMethod.ts';
import { PaymentResult } from './PaymentResult.ts';
import { Money } from '../shared/Money.ts';
import { Guard } from '../shared/Guard.ts';

/**
 * Settlement strategy for cash handed over at a branch counter.
 *
 * Assignment 1 Task 9 variant 1b: cash cannot be processed online, so this
 * strategy requires the branch and the cashier who received it. The amount
 * tendered is checked against the amount due, which is the concrete meaning of
 * Assignment 2's "confirm cash as received only when an authorized branch
 * records collection".
 */
export class CashPayment extends PaymentMethod {
  readonly branchId: string;
  readonly cashierName: string;
  readonly amountTendered: Money;

  private constructor(branchId: string, cashierName: string, amountTendered: Money) {
    super();
    this.branchId = branchId;
    this.cashierName = cashierName;
    this.amountTendered = amountTendered;
  }

  static create(input: { branchId: unknown; cashierName: unknown; amountTendered: unknown }): CashPayment {
    return Guard.collect(
      [
        () => Guard.text('branchId', input.branchId),
        () => Guard.text('cashierName', input.cashierName, 2, 100),
        () => Guard.positive('amountTendered', input.amountTendered),
      ],
      () =>
        new CashPayment(
          Guard.text('branchId', input.branchId),
          Guard.text('cashierName', input.cashierName, 2, 100),
          Money.of(Guard.positive('amountTendered', input.amountTendered), 'amountTendered'),
        ),
    );
  }

  override kind(): PaymentMethodKind {
    return 'CASH';
  }

  override confirm(amount: Money): PaymentResult {
    if (this.amountTendered.isLessThan(amount)) {
      return PaymentResult.insufficient(
        `Cash tendered (${this.amountTendered.format()}) is less than the amount due (${amount.format()}). Collect the balance and record the payment again.`,
      );
    }
    const change = this.amountTendered.minus(amount);
    const changeNote = change.isZero() ? 'no change due' : `change due ${change.format()}`;
    return PaymentResult.confirmed(
      `SIMULATED: cash of ${amount.format()} recorded by ${this.cashierName}; ${changeNote}. No banking system was contacted.`,
    );
  }

  override describe(): string {
    return `Cash at branch counter (received by ${this.cashierName})`;
  }
}
