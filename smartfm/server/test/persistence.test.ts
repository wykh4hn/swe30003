import { Expect } from './TestRunner.ts';
import type { TestRunner } from './TestRunner.ts';
import * as S from './ScenarioTestFixtures.ts';

/** Executable tests grouped by SmartFM business area. */
export function registerBootstrapTests(runner: TestRunner): void {
  runner.suite('Bootstrap — ApplicationContext (change C1)', () => {
    runner.test('the bootstrap sequence produces a fully wired application', async () => {
      const { app, dispose } = await S.freshApplication();
      try {
        Expect.isTrue(app.seeded, 'first run seeds reference data');
        Expect.equals(await app.repositories.branches.count(), 3, 'three branches');
        Expect.equals(await app.repositories.vehicles.count(), 9, 'nine vehicles');
        Expect.equals(await app.repositories.drivers.count(), 6, 'six drivers');
        Expect.equals(await app.repositories.orders.count(), 0, 'no orders are pre-baked');
        Expect.defined(app.services.dispatch, 'dispatch service constructed');
        Expect.defined(app.services.reporting, 'reporting service constructed');
      } finally {
        await dispose();
      }
    });

    runner.test('a restart reuses stored data and does not reissue identities', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const first = await app.repositories.orders.requireById(orderId);

        // Re-bootstrap over the same directory, exactly as restarting the server does.
        const restarted = await S.ApplicationContext.create({ dataDirectory: app.store.directoryPath, clock });
        Expect.isFalse(restarted.seeded, 'existing data is reused, not re-seeded');

        const { orderId: secondId } = await S.placeOrder(restarted, clock, S.CUSTOMER_TWO);
        Expect.isFalse(secondId === first.id, 'the restarted process issued a fresh identity');
      } finally {
        await dispose();
      }
    });
  });
}

export function registerPersistenceTests(runner: TestRunner): void {

  runner.suite('Persistence — repositories and the JSON file store (change C10)', () => {
    runner.test('an order survives a full round trip through storage', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { driverId, itineraryId } = await S.dispatchOrder(app, orderId);

        clock.advanceDays(1);
        await app.services.tracking.recordUpdate(driverId, {
          itineraryId,
          state: 'PICKED_UP',
          locationLabel: 'Ho Chi Minh City',
          note: 'Loaded at dock 3',
        });

        const reloaded = await S.ApplicationContext.create({
          dataDirectory: app.store.directoryPath,
          clock,
        });
        const order = await reloaded.repositories.orders.requireById(orderId);

        Expect.equals(order.status, 'IN_TRANSIT', 'status persisted');
        Expect.equals(order.trackingHistory.length, 1, 'tracking history persisted');
        Expect.equals(order.trackingHistory[0]?.note, 'Loaded at dock 3', 'nested value objects persisted');
        Expect.equals(order.cargo.totalWeightKg, 2_000, 'composed cargo persisted');
        Expect.equals(order.itineraryIds.length, 1, 'aggregated itinerary reference persisted');
        Expect.isTrue(order.changeHistory.length >= 3, 'audit trail persisted');
      } finally {
        await dispose();
      }
    });

    runner.test('the payment strategy is reconstructed as the right subclass', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { invoiceId } = await S.dispatchOrder(app, orderId);
        const invoice = await app.repositories.invoices.requireById(invoiceId);

        await app.services.billing.payInvoice(S.CUSTOMER_ONE, invoiceId, {
          method: 'CARD',
          card: { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '4242', expiryMonth: 12, expiryYear: 2030 },
        });

        const reloaded = await S.ApplicationContext.create({
          dataDirectory: app.store.directoryPath,
          clock,
        });
        const attempts = await reloaded.services.billing.listAttempts(invoiceId);
        const payment = Expect.defined(attempts[0], 'the stored payment');

        Expect.equals(payment.method.kind(), 'CARD', 'polymorphic strategy restored');
        Expect.isTrue(payment.method.describe().includes('4242'), 'strategy state restored');
        Expect.isTrue(payment.isSuccessful(), 'outcome restored');
        Expect.equals(payment.amount.amount, invoice.total().amount, 'amount restored exactly');
      } finally {
        await dispose();
      }
    });
  });
}
