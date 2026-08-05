import { Repository } from './Repository.ts';
import { RecordMapper } from './RecordMapper.ts';
import type { JsonFileStore, StoredRecord } from './JsonFileStore.ts';
import { Invoice } from '../../domain/billing/Invoice.ts';
import type { InvoiceStatus } from '../../domain/billing/Invoice.ts';
import { InvoiceLine } from '../../domain/billing/InvoiceLine.ts';
import { Payment } from '../../domain/billing/Payment.ts';
import { PaymentResult } from '../../domain/billing/PaymentResult.ts';
import type { PaymentOutcome } from '../../domain/billing/PaymentResult.ts';
import type { PaymentMethod } from '../../domain/billing/PaymentMethod.ts';
import { CashPayment } from '../../domain/billing/CashPayment.ts';
import { CardPayment } from '../../domain/billing/CardPayment.ts';
import { Receipt } from '../../domain/billing/Receipt.ts';

/** Persistence for invoices; line items are composed and therefore stored inline. */
export class InvoiceRepository extends Repository<Invoice> {
  constructor(store: JsonFileStore) {
    super(store, 'invoices');
  }

  protected override toRecord(entity: Invoice): StoredRecord {
    return {
      id: entity.id,
      invoiceNumber: entity.invoiceNumber,
      orderId: entity.orderId,
      customerId: entity.customerId,
      status: entity.status,
      issuedAt: RecordMapper.dateToRecord(entity.issuedAt),
      dueAt: RecordMapper.dateToRecord(entity.dueAt),
      settledByPaymentId: entity.settlingPaymentId ?? null,
      attemptIds: [...entity.paymentAttemptIds],
      lines: entity.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: RecordMapper.moneyToRecord(line.unitPrice),
      })),
    };
  }

  protected override fromRecord(record: StoredRecord): Invoice {
    const lines = RecordMapper.nestedList(record, 'lines').map((row) =>
      InvoiceLine.create(row['description'], row['quantity'], RecordMapper.moneyFromRecord(row['unitPrice'])),
    );

    return new Invoice({
      id: String(record['id']),
      invoiceNumber: String(record['invoiceNumber']),
      orderId: String(record['orderId']),
      customerId: String(record['customerId']),
      lines,
      issuedAt: RecordMapper.dateFromRecord(record['issuedAt']),
      dueAt: RecordMapper.dateFromRecord(record['dueAt']),
      status: String(record['status']) as InvoiceStatus,
      attemptIds: RecordMapper.stringList(record, 'attemptIds'),
      settledByPaymentId: RecordMapper.optionalTextFromRecord(record['settledByPaymentId']),
    });
  }

  async findByOrder(orderId: string): Promise<Invoice | undefined> {
    return this.findOneWhere((invoice) => invoice.orderId === orderId);
  }

  async findByCustomer(customerId: string): Promise<Invoice[]> {
    return this.findWhere((invoice) => invoice.customerId === customerId);
  }

  async countOutstandingForCustomer(customerId: string): Promise<number> {
    return this.count((invoice) => invoice.customerId === customerId && invoice.isOutstanding());
  }

  async findIssuedBetween(start: Date, end: Date): Promise<Invoice[]> {
    return this.findWhere(
      (invoice) => invoice.issuedAt.getTime() >= start.getTime() && invoice.issuedAt.getTime() < end.getTime(),
    );
  }
}

/**
 * Persistence for payment attempts.
 *
 * This repository is where the Strategy pattern meets storage. A `Payment` holds
 * an abstract `PaymentMethod`, so the row records a discriminator (`method.kind`)
 * plus the concrete strategy's own fields, and `fromRecord` reconstructs the
 * right subclass. Adding an e-wallet strategy later means adding one case here
 * and one class in the domain — nothing else in the system changes, which is the
 * benefit the pattern was chosen for.
 */
export class PaymentRepository extends Repository<Payment> {
  constructor(store: JsonFileStore) {
    super(store, 'payments');
  }

  protected override toRecord(entity: Payment): StoredRecord {
    return {
      id: entity.id,
      invoiceId: entity.invoiceId,
      orderId: entity.orderId,
      customerId: entity.customerId,
      amount: RecordMapper.moneyToRecord(entity.amount),
      attemptedAt: RecordMapper.dateToRecord(entity.attemptedAt),
      receiptId: entity.receiptId ?? null,
      method: PaymentRepository.methodToRecord(entity.method),
      result:
        entity.result === undefined
          ? null
          : {
              outcome: entity.result.outcome,
              message: entity.result.message,
              gatewayReference: entity.result.gatewayReference ?? null,
              retryable: entity.result.retryable,
            },
    };
  }

  protected override fromRecord(record: StoredRecord): Payment {
    const resultRow = record['result'];
    const result =
      resultRow === null || resultRow === undefined
        ? undefined
        : PaymentResult.rehydrate({
            outcome: String((resultRow as Record<string, unknown>)['outcome']) as PaymentOutcome,
            message: String((resultRow as Record<string, unknown>)['message']),
            gatewayReference: RecordMapper.optionalTextFromRecord(
              (resultRow as Record<string, unknown>)['gatewayReference'],
            ),
            retryable: Boolean((resultRow as Record<string, unknown>)['retryable']),
          });

    return new Payment({
      id: String(record['id']),
      invoiceId: String(record['invoiceId']),
      orderId: String(record['orderId']),
      customerId: String(record['customerId']),
      amount: RecordMapper.moneyFromRecord(record['amount']),
      method: PaymentRepository.methodFromRecord(RecordMapper.nested(record, 'method')),
      attemptedAt: RecordMapper.dateFromRecord(record['attemptedAt']),
      result,
      receiptId: RecordMapper.optionalTextFromRecord(record['receiptId']),
    });
  }

  /** Discriminated projection of the strategy. */
  private static methodToRecord(method: PaymentMethod): StoredRecord {
    if (method instanceof CashPayment) {
      return {
        kind: 'CASH',
        branchId: method.branchId,
        cashierName: method.cashierName,
        amountTendered: RecordMapper.moneyToRecord(method.amountTendered),
      };
    }
    if (method instanceof CardPayment) {
      return {
        kind: 'CARD',
        cardHolder: method.cardHolder,
        lastFourDigits: method.lastFourDigits,
        expiryMonth: method.expiryMonth,
        expiryYear: method.expiryYear,
      };
    }
    throw new Error(`No storage mapping is defined for payment method '${method.kind()}'.`);
  }

  private static methodFromRecord(record: Record<string, unknown>): PaymentMethod {
    switch (String(record['kind'])) {
      case 'CASH':
        return CashPayment.create({
          branchId: record['branchId'],
          cashierName: record['cashierName'],
          amountTendered: record['amountTendered'],
        });
      case 'CARD':
        return CardPayment.rehydrate({
          cardHolder: String(record['cardHolder']),
          lastFourDigits: String(record['lastFourDigits']),
          expiryMonth: Number(record['expiryMonth']),
          expiryYear: Number(record['expiryYear']),
        });
      default:
        throw new Error(`Stored payment method '${String(record['kind'])}' is not recognised.`);
    }
  }

  async findByInvoice(invoiceId: string): Promise<Payment[]> {
    const found = await this.findWhere((payment) => payment.invoiceId === invoiceId);
    return found.sort((left, right) => left.attemptedAt.getTime() - right.attemptedAt.getTime());
  }

  async findByCustomer(customerId: string): Promise<Payment[]> {
    return this.findWhere((payment) => payment.customerId === customerId);
  }
}

/** Persistence for receipts. Receipts are immutable, so rows are only ever inserted. */
export class ReceiptRepository extends Repository<Receipt> {
  constructor(store: JsonFileStore) {
    super(store, 'receipts');
  }

  protected override toRecord(entity: Receipt): StoredRecord {
    return {
      id: entity.id,
      receiptNumber: entity.receiptNumber,
      paymentId: entity.paymentId,
      invoiceId: entity.invoiceId,
      orderId: entity.orderId,
      customerId: entity.customerId,
      amount: RecordMapper.moneyToRecord(entity.amount),
      paidAt: RecordMapper.dateToRecord(entity.paidAt),
      methodDescription: entity.methodDescription,
      gatewayReference: entity.gatewayReference ?? null,
    };
  }

  protected override fromRecord(record: StoredRecord): Receipt {
    return new Receipt({
      id: String(record['id']),
      receiptNumber: String(record['receiptNumber']),
      paymentId: String(record['paymentId']),
      invoiceId: String(record['invoiceId']),
      orderId: String(record['orderId']),
      customerId: String(record['customerId']),
      amount: RecordMapper.moneyFromRecord(record['amount']),
      paidAt: RecordMapper.dateFromRecord(record['paidAt']),
      methodDescription: String(record['methodDescription']),
      gatewayReference: RecordMapper.optionalTextFromRecord(record['gatewayReference']),
    });
  }

  async findByOrder(orderId: string): Promise<Receipt | undefined> {
    return this.findOneWhere((receipt) => receipt.orderId === orderId);
  }

  async findByCustomer(customerId: string): Promise<Receipt[]> {
    const found = await this.findWhere((receipt) => receipt.customerId === customerId);
    return found.sort((left, right) => right.paidAt.getTime() - left.paidAt.getTime());
  }
}
