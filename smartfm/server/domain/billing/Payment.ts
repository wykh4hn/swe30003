import { Entity } from '../shared/Entity.ts';
import { Money } from '../shared/Money.ts';
import { RuleViolationError } from '../shared/DomainError.ts';
import type { Invoice } from './Invoice.ts';
import type { PaymentMethod } from './PaymentMethod.ts';
import { PaymentResult } from './PaymentResult.ts';
import { Receipt } from './Receipt.ts';

/**
 * One attempt to settle an invoice, and its outcome.
 *
 * Assignment 2 non-change N6: `Payment` still holds a `PaymentMethod` strategy
 * and delegates confirmation to it, so no conditional over payment kinds exists
 * anywhere in the system. Implementation confirmed the pattern was correctly
 * placed.
 *
 * Change C16 refines the contract: `attempt()` returns a `PaymentResult` value
 * object, and a payment can be attempted exactly once — a retry is a *new*
 * `Payment`, which is what gives the branch an honest record of how many times
 * settlement was tried (Assignment 1 Task 9 subtask 5).
 *
 * `issueReceipt()` deliberately lives here rather than on `Invoice`: the Creator
 * heuristic puts creation with the object holding the initialising data, and only
 * the payment knows the confirmed outcome, the method used and the gateway
 * reference that the receipt must carry.
 */
export class Payment extends Entity {
  readonly invoiceId: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly amount: Money;
  readonly method: PaymentMethod;
  readonly attemptedAt: Date;
  private paymentResult: PaymentResult | undefined;
  private issuedReceiptId: string | undefined;

  constructor(params: {
    id: string;
    invoiceId: string;
    orderId: string;
    customerId: string;
    amount: Money;
    method: PaymentMethod;
    attemptedAt: Date;
    result?: PaymentResult | undefined;
    receiptId?: string | undefined;
  }) {
    super(params.id);
    this.invoiceId = params.invoiceId;
    this.orderId = params.orderId;
    this.customerId = params.customerId;
    this.amount = params.amount;
    this.method = params.method;
    this.attemptedAt = params.attemptedAt;
    this.paymentResult = params.result;
    this.issuedReceiptId = params.receiptId;
  }

  get result(): PaymentResult | undefined {
    return this.paymentResult;
  }

  get receiptId(): string | undefined {
    return this.issuedReceiptId;
  }

  isSuccessful(): boolean {
    return this.paymentResult?.isSuccess() ?? false;
  }

  /**
   * Delegates to the strategy. The invoice is asked first, so an already-settled
   * invoice cannot even produce a second attempt.
   */
  attempt(invoice: Invoice): PaymentResult {
    if (this.paymentResult !== undefined) {
      throw new RuleViolationError('This payment attempt has already been processed. Start a new attempt to retry.');
    }
    invoice.assertPayable();
    if (!this.amount.equals(invoice.total())) {
      throw new RuleViolationError(
        `Payment of ${this.amount.format()} does not match the invoice total of ${invoice.total().format()}.`,
      );
    }

    this.paymentResult = this.method.confirm(this.amount);
    invoice.recordAttempt(this.id);
    if (this.paymentResult.isSuccess()) {
      invoice.settle(this.id);
    }
    return this.paymentResult;
  }

  /** Proof is created only after a successful confirmation, never before. */
  issueReceipt(receiptId: string, receiptNumber: string, now: Date): Receipt {
    if (!this.isSuccessful()) {
      throw new RuleViolationError('A receipt can only be issued for a confirmed payment.');
    }
    if (this.issuedReceiptId !== undefined) {
      throw new RuleViolationError('A receipt has already been issued for this payment.');
    }
    const receipt = new Receipt({
      id: receiptId,
      receiptNumber,
      paymentId: this.id,
      invoiceId: this.invoiceId,
      orderId: this.orderId,
      customerId: this.customerId,
      amount: this.amount,
      paidAt: now,
      methodDescription: this.method.describe(),
      gatewayReference: this.paymentResult?.gatewayReference,
    });
    this.issuedReceiptId = receiptId;
    return receipt;
  }

  /** Restores a stored result. Used only by the persistence layer. */
  restoreResult(result: PaymentResult): void {
    this.paymentResult = result;
  }

  describe(): string {
    const outcome = this.paymentResult?.outcome ?? 'PENDING';
    return `${this.amount.format()} via ${this.method.describe()} — ${outcome}`;
  }
}
