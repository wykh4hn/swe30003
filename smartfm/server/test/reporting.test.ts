import { Expect } from './TestRunner.ts';
import type { TestRunner } from './TestRunner.ts';
import * as D from './DomainTestFixtures.ts';
import * as S from './ScenarioTestFixtures.ts';

/** Executable tests grouped by SmartFM business area. */
export function registerReportingDomainTests(runner: TestRunner): void {
  runner.suite('Reporting — two focused reports replace one generic Report (C2)', () => {
    runner.test('an empty period returns a no-data result, not an error (variant 1b)', () => {
      const report = D.ShipmentStatisticsReport.compile({
        period: D.ReportPeriod.month(D.NOW),
        scopeLabel: 'All branches',
        orders: [],
        invoices: [],
        generatedAt: D.NOW,
      });
      Expect.isTrue(report.isEmpty(), 'empty period detected');
      Expect.isTrue(report.headline().includes('No shipment activity'), 'a readable message, not a crash');
    });

    runner.test('statistics count orders by status and measure on-time delivery', () => {
      const delivered = D.sampleOrder();
      delivered.accept('staff', D.NOW);
      delivered.attachItinerary('itn_000001', D.NOW, 'staff');
      delivered.dispatch('staff', D.NOW);
      delivered.appendTracking(
        D.TrackingUpdate.create({
          id: 'trk_1',
          orderId: delivered.id,
          itineraryId: 'itn_000001',
          recordedByDriverId: 'drv_000001',
          recordedAt: new Date(D.NOW.getTime() + 2 * D.DAY),
          state: 'DELIVERED',
          locationLabel: 'Da Nang',
        }),
      );
      const pending = D.sampleOrder();

      const report = D.ShipmentStatisticsReport.compile({
        period: D.ReportPeriod.month(D.NOW),
        scopeLabel: 'All branches',
        orders: [delivered, pending],
        invoices: [],
        generatedAt: D.NOW,
      });
      Expect.equals(report.totalOrders, 2, 'two orders counted');
      Expect.equals(report.deliveredCount, 1, 'one delivered');
      Expect.equals(report.onTimeDeliveryRate(), 100, 'delivered inside the window');
      Expect.equals(report.busiestLanes[0]?.orderCount, 2, 'both orders on the same lane');
    });

    runner.test('a report period resolves the presets Assignment 1 Task 10 named', () => {
      Expect.equals(D.ReportPeriod.resolve('DAY', D.NOW).preset, 'DAY', 'day preset');
      Expect.equals(D.ReportPeriod.resolve('YEAR_TO_DATE', D.NOW).preset, 'YEAR_TO_DATE', 'year-to-date preset');
      Expect.isTrue(D.ReportPeriod.week(D.NOW).range.durationDays() === 7, 'week spans seven days');
    });

    runner.test('reports are read-only: the compiled object is frozen', () => {
      const report = D.ShipmentStatisticsReport.compile({
        period: D.ReportPeriod.month(D.NOW),
        scopeLabel: 'All branches',
        orders: [],
        invoices: [],
        generatedAt: D.NOW,
      });
      Expect.isTrue(Object.isFrozen(report), 'no caller can mutate a report');
    });
  });
}

export function registerReportingScenarioTests(runner: TestRunner): void {
  runner.suite('Scenario 7 — Management reporting (A1 Task 10)', () => {
    runner.test('an empty period returns a no-data report, not an error (variant 1b)', async () => {
      const { app, dispose } = await S.freshApplication();
      try {
        const report = await app.services.reporting.shipmentStatistics({ preset: 'DAY' });
        Expect.isTrue(report.isEmpty(), 'no activity today');
        Expect.isTrue(report.headline().includes('No shipment activity'), 'a readable result');
      } finally {
        await dispose();
      }
    });

    runner.test('shipment statistics count a delivered order and its collected revenue', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { driverId, itineraryId, invoiceId } = await S.dispatchOrder(app, orderId);

        const invoice = await app.repositories.invoices.requireById(invoiceId);
        await app.services.billing.payInvoice(S.CUSTOMER_ONE, invoiceId, {
          method: 'CASH',
          cash: { branchId: S.HCM_BRANCH, cashierName: 'Le Van Minh', amountTendered: invoice.total().amount },
        });

        clock.advanceDays(1);
        await app.services.tracking.recordUpdate(driverId, {
          itineraryId,
          state: 'PICKED_UP',
          locationLabel: 'Ho Chi Minh City',
        });
        clock.advanceDays(1);
        await app.services.tracking.recordUpdate(driverId, {
          itineraryId,
          state: 'DELIVERED',
          locationLabel: 'Da Nang',
        });

        const report = await app.services.reporting.shipmentStatistics({ preset: 'MONTH', branchId: S.HCM_BRANCH });
        Expect.equals(report.totalOrders, 1, 'one order in the period');
        Expect.equals(report.deliveredCount, 1, 'delivered');
        Expect.equals(report.onTimeDeliveryRate(), 100, 'inside the customer window');
        Expect.equals(report.revenueCollected.amount, invoice.total().amount, 'revenue collected');
        Expect.equals(report.collectionRate(), 100, 'everything invoiced was collected');
      } finally {
        await dispose();
      }
    });

    runner.test('resource utilisation measures committed hours and finds idle vehicles', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { itineraryId } = await S.dispatchOrder(app, orderId);
        const itinerary = await app.repositories.itineraries.requireById(itineraryId);

        const report = await app.services.reporting.resourceUtilisation({ preset: 'MONTH', branchId: S.HCM_BRANCH });
        Expect.equals(report.totalItineraries, 1, 'one itinerary in the period');

        const workedRow = report.vehicleRows.find((row) => row.resourceId === itinerary.vehicleId);
        Expect.isTrue((workedRow?.committedHours ?? 0) > 0, 'committed hours recorded');
        Expect.isTrue(report.idleVehicles().length >= 1, 'unused vehicles are surfaced for redeployment');
      } finally {
        await dispose();
      }
    });

    runner.test('the cross-branch view covers every branch (subtask 3)', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        await S.placeOrder(app, clock);
        const scoped = await app.services.reporting.resourceUtilisation({ preset: 'MONTH', branchId: S.HCM_BRANCH });
        const all = await app.services.reporting.resourceUtilisation({ preset: 'MONTH' });
        Expect.isTrue(all.vehicleRows.length > scoped.vehicleRows.length, 'the national view is wider');
        Expect.equals(all.scopeLabel, 'All branches', 'scope stated on the report');
      } finally {
        await dispose();
      }
    });
  });

}
