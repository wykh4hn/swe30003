import { Entity } from '../shared/Entity.ts';
import { Money } from '../shared/Money.ts';
import { RuleViolationError } from '../shared/DomainError.ts';
import { InvoiceLine } from './InvoiceLine.ts';

export const INVOICE_STATUSES = ['OUTSTANDING', 'SETTLED', 'REFUNDED', 'VOID'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * The itemised amount due for an accepted shipment order.
 *
 * Assignment 2 non-change N7 (Invoice / Payment / Receipt remain three classes,
 * with one key abstraction each) plus change C6 (`InvoiceLine`, so the promised
 * itemisation actually exists) and C11 (`Money` instead of bare numbers).
 *
 * The invoice, not the payment and not a service, owns the rule that an amount
 * can only be settled once. Assignment 1 Task 9's critical scenario is
 * "simultaneous payment attempts on the same order", and centralising the guard
 * in `settle()` is what makes a second success impossible however many payment
 * objects are created.
 */
export class Invoice extends Entity {
  readonly invoiceNumber: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly issuedAt: Date;
  readonly dueAt: Date;
  private readonly invoiceLines: InvoiceLine[];
  private invoiceStatus: InvoiceStatus;
  private readonly attemptIds: string[];
  private settledByPaymentId: string | undefined;

  constructor(params: {
    id: string;
    invoiceNumber: string;
    orderId: string;
    customerId: string;
    lines: InvoiceLine[];
    issuedAt: Date;
    dueAt: Date;
    status?: InvoiceStatus;
    attemptIds?: string[];
    settledByPaymentId?: string | undefined;
  }) {
    super(params.id);
    if (params.lines.length === 0) {
      throw new RuleViolationError('An invoice must contain at least one line item.');
    }
    this.invoiceNumber = params.invoiceNumber;
    this.orderId = params.orderId;
    this.customerId = params.customerId;
    this.invoiceLines = params.lines;
    this.issuedAt = params.issuedAt;
    this.dueAt = params.dueAt;
    this.invoiceStatus = params.status ?? 'OUTSTANDING';
    this.attemptIds = params.attemptIds ?? [];
    this.settledByPaymentId = params.settledByPaymentId;
  }

  get lines(): readonly InvoiceLine[] {
    return this.invoiceLines;
  }

  get status(): InvoiceStatus {
    return this.invoiceStatus;
  }

  get paymentAttemptIds(): readonly string[] {
    return this.attemptIds;
  }

  get settlingPaymentId(): string | undefined {
    return this.settledByPaymentId;
  }

  /** Derived from the lines, so a total can never contradict its itemisation. */
  total(): Money {
    return Money.sum(this.invoiceLines.map((line) => line.lineTotal()));
  }

  isOutstanding(): boolean {
    return this.invoiceStatus === 'OUTSTANDING';
  }

  isOverdue(now: Date): boolean {
    return this.isOutstanding() && now.getTime() > this.dueAt.getTime();
  }

  /**
   * Assignment 1 Task 9 subtask 5: every attempt is logged, successful or not,
   * so the branch can see why a customer is still unpaid.
   */
  recordAttempt(paymentId: string): void {
    this.assertPayable();
    if (!this.attemptIds.includes(paymentId)) {
      this.attemptIds.push(paymentId);
    }
  }

  /** Refuses a second settlement — the guard behind Assignment 2's Scenario 4. */
  settle(paymentId: string): void {
    this.assertPayable();
    this.invoiceStatus = 'SETTLED';
    this.settledByPaymentId = paymentId;
  }

  assertPayable(): void {
    if (this.invoiceStatus === 'SETTLED') {
      throw new RuleViolationError(
        `Invoice ${this.invoiceNumber} has already been paid in full. No further payment is required.`,
        { invoiceNumber: this.invoiceNumber },
      );
    }
    if (this.invoiceStatus === 'VOID') {
      throw new RuleViolationError(`Invoice ${this.invoiceNumber} was cancelled and can no longer be paid.`);
    }
    if (this.invoiceStatus === 'REFUNDED') {
      throw new RuleViolationError(`Invoice ${this.invoiceNumber} has been refunded and can no longer be paid.`);
    }
  }

  /** Assignment 1 Task 6 variant 6a: a paid order that is validly cancelled is refunded. */
  markRefunded(): void {
    if (this.invoiceStatus !== 'SETTLED') {
      throw new RuleViolationError('Only a settled invoice can be refunded.');
    }
    this.invoiceStatus = 'REFUNDED';
  }

  /** An unpaid invoice for a cancelled order is voided rather than deleted. */
  voidInvoice(): void {
    if (this.invoiceStatus === 'SETTLED') {
      throw new RuleViolationError('A settled invoice cannot be voided. Record a refund instead.');
    }
    this.invoiceStatus = 'VOID';
  }

  render(): string {
    const body = this.invoiceLines.map((line) => `  ${line.format()}`).join('\n');
    return [
      `INVOICE ${this.invoiceNumber} (${this.invoiceStatus})`,
      `Issued ${this.issuedAt.toISOString().slice(0, 10)} — due ${this.dueAt.toISOString().slice(0, 10)}`,
      body,
      `  TOTAL: ${this.total().format()}`,
    ].join('\n');
  }
}
