import { Entity } from '../shared/Entity.ts';
import { Money } from '../shared/Money.ts';

/**
 * Immutable proof that one payment settled one invoice.
 *
 * Assignment 2 non-change N7, and one of the initial design's better decisions.
 * The Assignment 1 marker had flagged that `Invoice` and `Receipt` were merged
 * into a single entity; Assignment 2 separated them, and the implementation
 * confirms the separation earns its keep — an invoice mutates (it becomes
 * settled), whereas a receipt must never change once issued, so they cannot be
 * the same class.
 *
 * Every field is `readonly` and the object is frozen: the class exposes no
 * mutator at all. Assignment 2 Scenario 4's alternate path required that a later
 * cancellation records a refund *without deleting the original receipt*, which
 * only works if the receipt is genuinely immutable.
 */
export class Receipt extends Entity {
  readonly receiptNumber: string;
  readonly paymentId: string;
  readonly invoiceId: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly amount: Money;
  readonly paidAt: Date;
  readonly methodDescription: string;
  readonly gatewayReference: string | undefined;

  constructor(params: {
    id: string;
    receiptNumber: string;
    paymentId: string;
    invoiceId: string;
    orderId: string;
    customerId: string;
    amount: Money;
    paidAt: Date;
    methodDescription: string;
    gatewayReference?: string | undefined;
  }) {
    super(params.id);
    this.receiptNumber = params.receiptNumber;
    this.paymentId = params.paymentId;
    this.invoiceId = params.invoiceId;
    this.orderId = params.orderId;
    this.customerId = params.customerId;
    this.amount = params.amount;
    this.paidAt = params.paidAt;
    this.methodDescription = params.methodDescription;
    this.gatewayReference = params.gatewayReference;
    Object.freeze(this);
  }

  /** The printable form issued to the customer (Assignment 1 Task 9 subtask 4). */
  render(): string {
    const lines = [
      'ABC-TRANS / SmartFM — OFFICIAL RECEIPT',
      `Receipt no.   ${this.receiptNumber}`,
      `Issued        ${this.paidAt.toISOString().replace('T', ' ').slice(0, 16)}`,
      `Amount paid   ${this.amount.format()}`,
      `Method        ${this.methodDescription}`,
      `Invoice       ${this.invoiceId}`,
    ];
    if (this.gatewayReference !== undefined) {
      lines.push(`Gateway ref   ${this.gatewayReference}`);
    }
    lines.push('This receipt is proof of a simulated settlement for SWE30003 demonstration purposes.');
    return lines.join('\n');
  }
}
