import { PaymentMethod } from './PaymentMethod.ts';
import type { PaymentMethodKind } from './PaymentMethod.ts';
import { PaymentResult } from './PaymentResult.ts';
import type { Money } from '../shared/Money.ts';
import { Guard } from '../shared/Guard.ts';
import { ValidationError } from '../shared/DomainError.ts';

/**
 * Settlement strategy for card payment through the external gateway boundary.
 *
 * The Assignment 3 specification states that payment options need not be
 * implemented "as we cannot have a banking system to validate transactions", so
 * the gateway call is simulated and every message says so. Two deliberate design
 * choices survive the simulation:
 *
 *   - Only the last four digits, the holder name and the expiry are accepted.
 *     A full card number is never taken, transmitted or stored, so no cardholder
 *     data exists to protect. A real integration would replace `confirm()` with
 *     a gateway call and change nothing else.
 *   - The simulated outcome is *deterministic*, driven by the last four digits.
 *     This makes the decline and timeout paths of Assignment 1 Task 9 variant 3a
 *     demonstrable on demand rather than a matter of luck:
 *
 *         ...0000  declined      ...9999  gateway timeout      anything else  confirmed
 */
export class CardPayment extends PaymentMethod {
  readonly cardHolder: string;
  readonly lastFourDigits: string;
  readonly expiryMonth: number;
  readonly expiryYear: number;

  private constructor(cardHolder: string, lastFourDigits: string, expiryMonth: number, expiryYear: number) {
    super();
    this.cardHolder = cardHolder;
    this.lastFourDigits = lastFourDigits;
    this.expiryMonth = expiryMonth;
    this.expiryYear = expiryYear;
  }

  static create(
    input: { cardHolder: unknown; lastFourDigits: unknown; expiryMonth: unknown; expiryYear: unknown },
    now: Date,
  ): CardPayment {
    const currentYear = now.getFullYear();
    return Guard.collect(
      [
        () => Guard.text('cardHolder', input.cardHolder, 2, 100),
        () => CardPayment.validateLastFour(input.lastFourDigits),
        () => Guard.number('expiryMonth', input.expiryMonth, 1, 12),
        () => Guard.number('expiryYear', input.expiryYear, currentYear, currentYear + 15),
        () => CardPayment.validateNotExpired(input.expiryMonth, input.expiryYear, now),
      ],
      () =>
        new CardPayment(
          Guard.text('cardHolder', input.cardHolder, 2, 100),
          CardPayment.validateLastFour(input.lastFourDigits),
          Guard.number('expiryMonth', input.expiryMonth, 1, 12),
          Guard.number('expiryYear', input.expiryYear, currentYear, currentYear + 15),
        ),
    );
  }

  /**
   * Rebuilds a stored card payment without re-checking the expiry date — a card
   * used last year has legitimately expired since. Used only by persistence.
   */
  static rehydrate(params: {
    cardHolder: string;
    lastFourDigits: string;
    expiryMonth: number;
    expiryYear: number;
  }): CardPayment {
    return new CardPayment(params.cardHolder, params.lastFourDigits, params.expiryMonth, params.expiryYear);
  }

  private static validateLastFour(value: unknown): string {
    const text = String(value ?? '').trim();
    if (!/^\d{4}$/.test(text)) {
      throw new ValidationError('lastFourDigits', 'Enter exactly the last 4 digits of the card.');
    }
    return text;
  }

  private static validateNotExpired(month: unknown, year: unknown, now: Date): void {
    const expiryMonth = Number(month);
    const expiryYear = Number(year);
    if (!Number.isFinite(expiryMonth) || !Number.isFinite(expiryYear)) {
      return; // Reported by the range checks above.
    }
    // A card is valid through the last day of its expiry month.
    const expiresAfter = new Date(expiryYear, expiryMonth, 1);
    if (expiresAfter.getTime() <= now.getTime()) {
      throw new ValidationError('expiryMonth', 'This card has expired. Use a different card.');
    }
  }

  override kind(): PaymentMethodKind {
    return 'CARD';
  }

  override confirm(amount: Money): PaymentResult {
    switch (this.lastFourDigits) {
      case '0000':
        return PaymentResult.declined(
          'SIMULATED: the card issuer declined the transaction (insufficient funds). Try another card or pay cash at a branch.',
        );
      case '9999':
        return PaymentResult.timedOut(
          'SIMULATED: the payment gateway did not respond in time. The invoice is unchanged — please try again.',
        );
      default:
        return PaymentResult.confirmed(
          `SIMULATED: card ending ${this.lastFourDigits} authorised for ${amount.format()}. No real funds were transferred.`,
          `SIM-${Date.now().toString(36).toUpperCase()}`,
        );
    }
  }

  override describe(): string {
    const month = String(this.expiryMonth).padStart(2, '0');
    return `Card ending ${this.lastFourDigits} (${this.cardHolder}, exp ${month}/${this.expiryYear})`;
  }
}
