import { Invoice } from '../domain/billing/Invoice.ts';
import { Payment } from '../domain/billing/Payment.ts';
import { CashPayment } from '../domain/billing/CashPayment.ts';
import { CardPayment } from '../domain/billing/CardPayment.ts';
import type { PaymentMethod } from '../domain/billing/PaymentMethod.ts';
import type { PaymentResult } from '../domain/billing/PaymentResult.ts';
import type { Receipt } from '../domain/billing/Receipt.ts';
import type { ShipmentOrder } from '../domain/ordering/ShipmentOrder.ts';
import { Guard } from '../domain/shared/Guard.ts';
import { NotFoundError, RuleViolationError, ValidationError } from '../domain/shared/DomainError.ts';
import type {
  InvoiceRepository,
  PaymentRepository,
  ReceiptRepository,
} from '../infrastructure/persistence/BillingRepositories.ts';
import type { ShipmentOrderRepository } from '../infrastructure/persistence/OrderingRepositories.ts';
import type { Clock } from '../infrastructure/Clock.ts';
import type { IdGenerator } from '../infrastructure/IdGenerator.ts';
import type { PricingService } from './PricingService.ts';
import type { RoutePlanner } from './RoutePlanner.ts';
import type { NotificationService } from './NotificationService.ts';

const PAYMENT_TERMS_DAYS = 14;

/** What the customer is told after a payment attempt. */
export interface PaymentOutcomeView {
  readonly succeeded: boolean;
  readonly message: string;
  readonly retryable: boolean;
  readonly invoiceStatus: string;
  readonly receipt: Receipt | undefined;
}

/**
 * Business area 5 — Billing and Payment (Assignment 1 Task 9).
 *
 * Part of change C1. The Assignment 3 specification removes real payment
 * processing from scope: "the implementation does not need to support payment
 * options as we cannot have a banking system to validate transactions … some
 * simple message will be sufficient". Every settlement here is therefore
 * **simulated**, and every message says so.
 *
 * What is *not* simplified is the object design around payment, because that is
 * what is being marked. The Strategy pattern (non-change N6), the one-way
 * Invoice -> Payment -> Receipt creation chain, and the rule that an invoice can
 * be settled exactly once all behave exactly as they would against a real
 * gateway; only `PaymentMethod.confirm()` is stubbed.
 */
export class BillingService {
  private readonly invoices: InvoiceRepository;
  private readonly payments: PaymentRepository;
  private readonly receipts: ReceiptRepository;
  private readonly orders: ShipmentOrderRepository;
  private readonly pricing: PricingService;
  private readonly routePlanner: RoutePlanner;
  private readonly notifications: NotificationService;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(dependencies: {
    invoices: InvoiceRepository;
    payments: PaymentRepository;
    receipts: ReceiptRepository;
    orders: ShipmentOrderRepository;
    pricing: PricingService;
    routePlanner: RoutePlanner;
    notifications: NotificationService;
    clock: Clock;
    ids: IdGenerator;
  }) {
    this.invoices = dependencies.invoices;
    this.payments = dependencies.payments;
    this.receipts = dependencies.receipts;
    this.orders = dependencies.orders;
    this.pricing = dependencies.pricing;
    this.routePlanner = dependencies.routePlanner;
    this.notifications = dependencies.notifications;
    this.clock = dependencies.clock;
    this.ids = dependencies.ids;
  }

  /**
   * Issues the itemised invoice once an order is dispatched. The line items come
   * from the same `PricingService` call that produced the customer's quote, so
   * the bill can never disagree with what they agreed to (change C13).
   */
  async issueInvoiceFor(order: ShipmentOrder): Promise<Invoice> {
    const existing = await this.invoices.findByOrder(order.id);
    if (existing !== undefined) {
      return existing;
    }

    const now = this.clock.now();
    const route = await this.routePlanner.planRoute(
      order.delivery.pickupAddress.city,
      order.delivery.deliveryAddress.city,
    );

    const invoice = new Invoice({
      id: this.ids.next('inv'),
      invoiceNumber: this.ids.nextReference('INV', now.getFullYear()),
      orderId: order.id,
      customerId: order.customerId,
      lines: this.pricing.quote(order.cargo, order.delivery, route),
      issuedAt: now,
      dueAt: new Date(now.getTime() + PAYMENT_TERMS_DAYS * 24 * 60 * 60 * 1000),
    });

    await this.invoices.save(invoice);

    order.registerObserver(this.notifications);
    order.attachInvoice(invoice.id, now);
    await this.orders.save(order);

    return invoice;
  }

  async findInvoiceForOrder(orderId: string): Promise<Invoice | undefined> {
    return this.invoices.findByOrder(orderId);
  }

  async listInvoicesForCustomer(customerId: string): Promise<Invoice[]> {
    const found = await this.invoices.findByCustomer(customerId);
    return found.sort((left, right) => right.issuedAt.getTime() - left.issuedAt.getTime());
  }

  async listReceiptsForCustomer(customerId: string): Promise<Receipt[]> {
    return this.receipts.findByCustomer(customerId);
  }

  async listAttempts(invoiceId: string): Promise<import('../domain/billing/Payment.ts').Payment[]> {
    return this.payments.findByInvoice(invoiceId);
  }

  /**
   * Assignment 1 Task 9, the whole task.
   *
   * The sequence is exactly Assignment 2's Scenario 4 and did not need changing:
   * the invoice authorises the attempt, `Payment` delegates to the strategy, and
   * only a confirmed result settles the invoice and produces a receipt. A
   * decline (card ending 0000), a timeout (card ending 9999) or short cash all
   * leave the invoice outstanding with the failed attempt on record.
   */
  async payInvoice(
    customerId: string,
    invoiceId: string,
    request: { method: unknown; cash?: unknown; card?: unknown },
  ): Promise<PaymentOutcomeView> {
    const now = this.clock.now();
    const invoice = await this.invoices.findById(invoiceId);
    if (invoice === undefined) {
      throw new NotFoundError('Invoice', invoiceId);
    }
    if (invoice.customerId !== customerId) {
      throw new NotFoundError('Invoice', invoiceId);
    }
    invoice.assertPayable();

    const method = this.buildMethod(request, now);
    const payment = new Payment({
      id: this.ids.next('pay'),
      invoiceId: invoice.id,
      orderId: invoice.orderId,
      customerId,
      amount: invoice.total(),
      method,
      attemptedAt: now,
    });

    const result: PaymentResult = payment.attempt(invoice);
    await this.invoices.save(invoice);

    let receipt: Receipt | undefined;
    if (result.isSuccess()) {
      receipt = payment.issueReceipt(this.ids.next('rcp'), this.ids.nextReference('RCP', now.getFullYear()), now);
      await this.receipts.save(receipt);

      const order = await this.orders.findById(invoice.orderId);
      if (order !== undefined) {
        order.registerObserver(this.notifications);
        order.confirmPaid(receipt.receiptNumber, now);
        await this.orders.save(order);
      }
    }
    await this.payments.save(payment);

    return {
      succeeded: result.isSuccess(),
      message: result.message,
      retryable: result.retryable,
      invoiceStatus: invoice.status,
      receipt,
    };
  }

  /** Chooses the concrete strategy from the request; the rest of the flow is identical. */
  private buildMethod(request: { method: unknown; cash?: unknown; card?: unknown }, now: Date): PaymentMethod {
    const kind = Guard.oneOf('method', request.method, ['CASH', 'CARD'] as const);
    if (kind === 'CASH') {
      if (request.cash === undefined || request.cash === null) {
        throw new ValidationError('cash', 'Cash payment details are required.');
      }
      return CashPayment.create(request.cash as never);
    }
    if (request.card === undefined || request.card === null) {
      throw new ValidationError('card', 'Card details are required.');
    }
    return CardPayment.create(request.card as never, now);
  }

  /**
   * Assignment 1 Task 6 variant 6a: a validly cancelled order that was already
   * paid is refunded, and the original receipt is preserved rather than deleted.
   */
  async refundForCancelledOrder(orderId: string): Promise<Invoice | undefined> {
    const invoice = await this.invoices.findByOrder(orderId);
    if (invoice === undefined) {
      return undefined;
    }
    const order = await this.orders.findById(orderId);
    if (order !== undefined && order.status !== 'CANCELLED') {
      throw new RuleViolationError('A refund can only be recorded for a cancelled order.');
    }

    if (invoice.status === 'SETTLED') {
      invoice.markRefunded();
    } else if (invoice.isOutstanding()) {
      invoice.voidInvoice();
    }
    return this.invoices.save(invoice);
  }
}
