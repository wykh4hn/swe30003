import { Expect } from './TestRunner.ts';
import type { TestRunner } from './TestRunner.ts';
import * as D from './DomainTestFixtures.ts';
import * as S from './ScenarioTestFixtures.ts';

/** Executable tests grouped by SmartFM business area. */
export function registerBillingDomainTests(runner: TestRunner): void {
  runner.suite('Billing — invoice, strategy, receipt (A1 Task 9)', () => {
    runner.test('the invoice total is derived from its line items', () => {
      const invoice = new D.Invoice({
        id: 'inv',
        invoiceNumber: 'INV-2026-000001',
        orderId: 'ord',
        customerId: 'cus',
        lines: [
          D.InvoiceLine.create('Base handling fee', 1, D.Money.of(250_000)),
          D.InvoiceLine.create('Line haul', 960, D.Money.of(11_000)),
        ],
        issuedAt: D.NOW,
        dueAt: new Date(D.NOW.getTime() + 14 * D.DAY),
      });
      Expect.equals(invoice.total().amount, 250_000 + 960 * 11_000, 'total matches the itemisation');
    });

    runner.test('an invoice with no line items is refused', async () => {
      await Expect.throws(
        () =>
          new D.Invoice({
            id: 'inv',
            invoiceNumber: 'INV-1',
            orderId: 'ord',
            customerId: 'cus',
            lines: [],
            issuedAt: D.NOW,
            dueAt: D.NOW,
          }),
        'at least one line item',
        'empty invoice refused',
      );
    });

    runner.test('a card ending 0000 is declined and leaves the invoice outstanding', () => {
      const invoice = D.sampleInvoice();
      const payment = new D.Payment({
        id: 'pay_1',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: D.CardPayment.create(
          { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '0000', expiryMonth: 12, expiryYear: 2030 },
          D.NOW,
        ),
        attemptedAt: D.NOW,
      });
      const result = payment.attempt(invoice);
      Expect.isFalse(result.isSuccess(), 'declined');
      Expect.isTrue(result.retryable, 'customer may retry');
      Expect.equals(invoice.status, 'OUTSTANDING', 'invoice unchanged');
      Expect.equals(invoice.paymentAttemptIds.length, 1, 'the failed attempt is still on record');
    });

    runner.test('a card ending 9999 reports a gateway timeout', () => {
      const invoice = D.sampleInvoice();
      const payment = new D.Payment({
        id: 'pay_2',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: D.CardPayment.create(
          { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '9999', expiryMonth: 12, expiryYear: 2030 },
          D.NOW,
        ),
        attemptedAt: D.NOW,
      });
      Expect.equals(payment.attempt(invoice).outcome, 'GATEWAY_TIMEOUT', 'timeout reported distinctly');
    });

    runner.test('an expired card is refused before any attempt is made', async () => {
      await Expect.throws(
        () =>
          D.CardPayment.create(
            { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '1234', expiryMonth: 1, expiryYear: 2026 },
            new Date('2026-08-05T08:00:00.000Z'),
          ),
        'expired',
        'expired card refused',
      );
    });

    runner.test('short cash is refused with the shortfall explained', () => {
      const invoice = D.sampleInvoice();
      const payment = new D.Payment({
        id: 'pay_3',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: D.CashPayment.create({ branchId: 'brn_000001', cashierName: 'Le Van Minh', amountTendered: 1_000 }),
        attemptedAt: D.NOW,
      });
      const result = payment.attempt(invoice);
      Expect.equals(result.outcome, 'INSUFFICIENT_AMOUNT', 'shortfall detected');
      Expect.isTrue(invoice.isOutstanding(), 'invoice still outstanding');
    });

    runner.test('a confirmed payment settles the invoice and produces a receipt', () => {
      const invoice = D.sampleInvoice();
      const payment = new D.Payment({
        id: 'pay_4',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: D.CashPayment.create({ branchId: 'brn_000001', cashierName: 'Le Van Minh', amountTendered: 500_000 }),
        attemptedAt: D.NOW,
      });
      Expect.isTrue(payment.attempt(invoice).isSuccess(), 'confirmed');
      Expect.equals(invoice.status, 'SETTLED', 'invoice settled');

      const receipt = payment.issueReceipt('rcp_1', 'RCP-2026-000001', D.NOW);
      Expect.equals(receipt.amount.amount, invoice.total().amount, 'receipt carries the settled amount');
      Expect.isTrue(Object.isFrozen(receipt), 'receipts are immutable');
    });

    runner.test('a settled invoice refuses a second payment (A1 Task 9 critical case)', async () => {
      const invoice = D.sampleInvoice();
      const first = new D.Payment({
        id: 'pay_5',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: D.CashPayment.create({ branchId: 'brn_000001', cashierName: 'Le Van Minh', amountTendered: 500_000 }),
        attemptedAt: D.NOW,
      });
      first.attempt(invoice);

      const second = new D.Payment({
        id: 'pay_6',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: D.CashPayment.create({ branchId: 'brn_000001', cashierName: 'Le Van Minh', amountTendered: 500_000 }),
        attemptedAt: D.NOW,
      });
      await Expect.throws(() => second.attempt(invoice), 'already been paid', 'double settlement refused');
    });

    runner.test('a receipt cannot be issued for a failed payment', async () => {
      const invoice = D.sampleInvoice();
      const payment = new D.Payment({
        id: 'pay_7',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: D.CardPayment.create(
          { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '0000', expiryMonth: 12, expiryYear: 2030 },
          D.NOW,
        ),
        attemptedAt: D.NOW,
      });
      payment.attempt(invoice);
      await Expect.throws(
        () => payment.issueReceipt('rcp', 'RCP-1', D.NOW),
        'only be issued for a confirmed payment',
        'no receipt without settlement',
      );
    });

    runner.test('a payment whose amount does not match the invoice is refused', async () => {
      const invoice = D.sampleInvoice();
      const payment = new D.Payment({
        id: 'pay_8',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: D.Money.of(1),
        method: D.CashPayment.create({ branchId: 'brn_000001', cashierName: 'Le Van Minh', amountTendered: 1 }),
        attemptedAt: D.NOW,
      });
      await Expect.throws(() => payment.attempt(invoice), 'does not match the invoice total', 'amount checked');
    });
  });

}

export function registerBillingScenarioTests(runner: TestRunner): void {
  runner.suite('Scenario 4 — Pay an invoice and receive a receipt (A1 Task 9)', () => {
    runner.test('a declined card leaves the invoice outstanding and the attempt on record', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { invoiceId } = await S.dispatchOrder(app, orderId);

        const outcome = await app.services.billing.payInvoice(S.CUSTOMER_ONE, invoiceId, {
          method: 'CARD',
          card: { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '0000', expiryMonth: 12, expiryYear: 2030 },
        });
        Expect.isFalse(outcome.succeeded, 'declined');
        Expect.isTrue(outcome.message.includes('SIMULATED'), 'the message states that settlement is simulated');
        Expect.equals(outcome.invoiceStatus, 'OUTSTANDING', 'invoice unchanged');
        Expect.equals((await app.services.billing.listAttempts(invoiceId)).length, 1, 'the failed attempt is kept');
      } finally {
        await dispose();
      }
    });

    runner.test('the customer retries with cash and receives a receipt', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { invoiceId } = await S.dispatchOrder(app, orderId);
        const invoice = await app.repositories.invoices.requireById(invoiceId);

        await app.services.billing.payInvoice(S.CUSTOMER_ONE, invoiceId, {
          method: 'CARD',
          card: { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '0000', expiryMonth: 12, expiryYear: 2030 },
        });

        const outcome = await app.services.billing.payInvoice(S.CUSTOMER_ONE, invoiceId, {
          method: 'CASH',
          cash: { branchId: S.HCM_BRANCH, cashierName: 'Le Van Minh', amountTendered: invoice.total().amount },
        });
        Expect.isTrue(outcome.succeeded, 'settled on the second attempt');
        Expect.equals(outcome.invoiceStatus, 'SETTLED', 'invoice settled');

        const receipt = Expect.defined(outcome.receipt, 'a receipt was issued');
        Expect.isTrue(receipt.receiptNumber.startsWith('RCP-2026-'), 'receipt numbered');
        Expect.equals((await app.services.billing.listAttempts(invoiceId)).length, 2, 'both attempts on record');
      } finally {
        await dispose();
      }
    });

    runner.test('short cash is refused with the shortfall explained', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { invoiceId } = await S.dispatchOrder(app, orderId);

        const outcome = await app.services.billing.payInvoice(S.CUSTOMER_ONE, invoiceId, {
          method: 'CASH',
          cash: { branchId: S.HCM_BRANCH, cashierName: 'Le Van Minh', amountTendered: 1_000 },
        });
        Expect.isFalse(outcome.succeeded, 'refused');
        Expect.isTrue(outcome.retryable, 'the customer can collect the balance and try again');
      } finally {
        await dispose();
      }
    });

    runner.test('a settled invoice cannot be paid twice', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { invoiceId } = await S.dispatchOrder(app, orderId);
        const invoice = await app.repositories.invoices.requireById(invoiceId);
        const cash = { branchId: S.HCM_BRANCH, cashierName: 'Le Van Minh', amountTendered: invoice.total().amount };

        await app.services.billing.payInvoice(S.CUSTOMER_ONE, invoiceId, { method: 'CASH', cash });
        await Expect.throws(
          () => app.services.billing.payInvoice(S.CUSTOMER_ONE, invoiceId, { method: 'CASH', cash }),
          'already been paid',
          'double settlement refused',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('another customer cannot pay, or even see, this invoice', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { invoiceId } = await S.dispatchOrder(app, orderId);
        await Expect.throws(
          () =>
            app.services.billing.payInvoice(S.CUSTOMER_TWO, invoiceId, {
              method: 'CASH',
              cash: { branchId: S.HCM_BRANCH, cashierName: 'Le Van Minh', amountTendered: 999_999_999 },
            }),
          'not found',
          'ownership enforced on billing too',
        );
      } finally {
        await dispose();
      }
    });
  });

}
