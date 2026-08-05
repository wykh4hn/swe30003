import type { Money } from '../shared/Money.ts';
import type { PaymentResult } from './PaymentResult.ts';

export const PAYMENT_METHOD_KINDS = ['CASH', 'CARD'] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

/**
 * Strategy role for confirming a payment.
 *
 * Assignment 2 non-change N6, and the design decision implementation vindicated
 * most clearly. `Payment` still calls `confirm()` without knowing which strategy
 * it holds, so adding e-wallet settlement later touches no shipment, invoice or
 * receipt logic. The only refinement is the return type: `confirm()` now yields
 * a `PaymentResult` value object rather than the unspecified "confirmed or
 * failed result" of Assignment 2 (change C16).
 *
 * Per the Assignment 3 specification, settlement is *simulated*: no banking
 * system is contacted and no funds move. The simulation is confined to the two
 * concrete strategies, so the surrounding design is exactly what a real gateway
 * integration would plug into.
 */
export abstract class PaymentMethod {
  abstract kind(): PaymentMethodKind;

  /** Attempts settlement of `amount` and reports the outcome. */
  abstract confirm(amount: Money): PaymentResult;

  /** Human-readable description printed on the receipt. */
  abstract describe(): string;
}
