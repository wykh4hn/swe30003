export const PAYMENT_OUTCOMES = ['CONFIRMED', 'DECLINED', 'INSUFFICIENT_AMOUNT', 'GATEWAY_TIMEOUT'] as const;
export type PaymentOutcome = (typeof PAYMENT_OUTCOMES)[number];

/**
 * The immutable result of one payment attempt.
 *
 * Assignment 3 change C16. Assignment 2 said `PaymentMethod` should "return a
 * confirmed or failed result", but nothing described what that result carried,
 * so `Payment` could not have been implemented without inventing it. Returning a
 * value object rather than a boolean is what lets Assignment 1 Task 9 variant 3a
 * tell the customer *why* an attempt failed and whether retrying is worthwhile.
 */
export class PaymentResult {
  readonly outcome: PaymentOutcome;
  readonly message: string;
  readonly gatewayReference: string | undefined;
  readonly retryable: boolean;

  private constructor(outcome: PaymentOutcome, message: string, gatewayReference: string | undefined, retryable: boolean) {
    this.outcome = outcome;
    this.message = message;
    this.gatewayReference = gatewayReference;
    this.retryable = retryable;
    Object.freeze(this);
  }

  static confirmed(message: string, gatewayReference?: string): PaymentResult {
    return new PaymentResult('CONFIRMED', message, gatewayReference, false);
  }

  static declined(message: string): PaymentResult {
    return new PaymentResult('DECLINED', message, undefined, true);
  }

  static insufficient(message: string): PaymentResult {
    return new PaymentResult('INSUFFICIENT_AMOUNT', message, undefined, true);
  }

  static timedOut(message: string): PaymentResult {
    return new PaymentResult('GATEWAY_TIMEOUT', message, undefined, true);
  }

  /** Rebuilds a stored result. Used only by the persistence layer. */
  static rehydrate(params: {
    outcome: PaymentOutcome;
    message: string;
    gatewayReference: string | undefined;
    retryable: boolean;
  }): PaymentResult {
    return new PaymentResult(params.outcome, params.message, params.gatewayReference, params.retryable);
  }

  isSuccess(): boolean {
    return this.outcome === 'CONFIRMED';
  }
}
