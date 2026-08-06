import { Expect } from './TestRunner.ts';
import type { TestRunner } from './TestRunner.ts';
import * as D from './DomainTestFixtures.ts';
import * as S from './ScenarioTestFixtures.ts';

/** Executable tests grouped by SmartFM business area. */
export function registerDispatchDomainTests(runner: TestRunner): void {
  runner.suite('Route and Itinerary — reusable lanes, no double-booking (C4/C5/C6)', () => {
    runner.test('a route derives its distance and duration from its legs', () => {
      const route = D.sampleRoute();
      Expect.equals(route.totalDistanceKm(), 960, 'distance is the sum of legs');
      Expect.equals(route.waypoints().length, 3, 'origin, hub and destination');
    });

    runner.test('a route with no legs is refused', async () => {
      await Expect.throws(
        () => new D.Route({ id: 'r', origin: 'Ha Noi', destination: 'Da Nang', legs: [] }),
        'at least one leg',
        'empty route refused',
      );
    });

    runner.test('a route knows which lane it serves, so it can be reused', () => {
      Expect.isTrue(D.sampleRoute().serves('Ho Chi Minh City', 'Da Nang'), 'lane matched');
      Expect.isFalse(D.sampleRoute().serves('Ha Noi', 'Da Nang'), 'other lane not matched');
    });

    const makeItinerary = (id: string, vehicleId: string, driverId: string, offsetDays: number): D.Itinerary =>
      new D.Itinerary({
        id,
        orderId: 'ord_test',
        branchId: 'brn_000001',
        vehicleId,
        driverId,
        routeId: 'rte_test',
        legNumber: 1,
        assignedWeightKg: 2_000,
        window: D.DateRange.create(
          new Date(D.NOW.getTime() + offsetDays * D.DAY),
          new Date(D.NOW.getTime() + (offsetDays + 2) * D.DAY),
        ),
      });

    runner.test('two itineraries sharing a vehicle in overlapping windows clash', () => {
      const first = makeItinerary('itn_1', 'veh_1', 'drv_1', 1);
      const second = makeItinerary('itn_2', 'veh_1', 'drv_2', 2);
      Expect.isTrue(first.conflictsWith(second), 'same vehicle, overlapping window');
    });

    runner.test('the same vehicle in non-overlapping windows does not clash', () => {
      const first = makeItinerary('itn_1', 'veh_1', 'drv_1', 1);
      const second = makeItinerary('itn_2', 'veh_1', 'drv_2', 10);
      Expect.isFalse(first.conflictsWith(second), 'windows are disjoint');
    });

    runner.test('a completed itinerary holds nothing and cannot clash', () => {
      const first = makeItinerary('itn_1', 'veh_1', 'drv_1', 1);
      const second = makeItinerary('itn_2', 'veh_1', 'drv_2', 2);
      first.complete(new Date(D.NOW.getTime() + 3 * D.DAY));
      Expect.isFalse(first.conflictsWith(second), 'completed itinerary releases its resources');
    });

    runner.test('change C5: a completed itinerary still records the hours it consumed', () => {
      const itinerary = makeItinerary('itn_1', 'veh_1', 'drv_1', 1);
      itinerary.complete(new Date(D.NOW.getTime() + 3 * D.DAY));
      Expect.equals(itinerary.committedHours(), 48, 'two days of committed resource time survive the order');
    });
  });

  // -------------------------------------------------- capacity holds (C14)
}

export function registerDispatchScenarioTests(runner: TestRunner): void {
  runner.suite('Scenario 2 — Process and dispatch an order (A1 Task 7)', () => {
    runner.test('the branch queue shows the pending order', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const queue = await app.services.dispatch.pendingQueue(S.HCM_BRANCH);
        Expect.equals(queue.length, 1, 'one order waiting');
        Expect.equals(queue[0]?.id, orderId, 'it is the order just placed');
      } finally {
        await dispose();
      }
    });

    runner.test('the review reports no blocking problems for a clean order', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const review = await app.services.dispatch.reviewOrder(S.HCM_BRANCH, orderId, 'Nguyen Thi Hoa');
        Expect.isTrue(review.canAccept, 'acceptable');
        Expect.equals(review.problems.length, 0, 'no problems');
      } finally {
        await dispose();
      }
    });

    runner.test('a likely duplicate raises a warning without blocking (variant 3b)', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        await S.placeOrder(app, clock);
        const { orderId } = await S.placeOrder(app, clock);
        const review = await app.services.dispatch.reviewOrder(S.HCM_BRANCH, orderId, 'Nguyen Thi Hoa');
        Expect.isTrue(review.warnings.some((text) => text.includes('duplicate')), 'duplicate flagged');
        Expect.isTrue(review.canAccept, 'a warning does not block the branch');
      } finally {
        await dispose();
      }
    });

    runner.test('another branch cannot process this branch’s order', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        await Expect.throws(
          () => app.services.dispatch.acceptOrder('brn_000002', orderId, 'Someone Else'),
          'belongs to another branch',
          'queue isolation enforced end to end',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('accept then assign then dispatch commits the resources', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { itineraryId } = await S.dispatchOrder(app, orderId);

        const order = await app.repositories.orders.requireById(orderId);
        Expect.equals(order.status, 'DISPATCHED', 'order dispatched');

        const itinerary = await app.repositories.itineraries.requireById(itineraryId);
        Expect.equals(itinerary.status, 'ACTIVE', 'itinerary activated');

        const vehicle = await app.repositories.vehicles.requireById(itinerary.vehicleId);
        Expect.equals(vehicle.status, 'ASSIGNED', 'vehicle committed');

        const driver = await app.repositories.drivers.requireById(itinerary.driverId);
        Expect.equals(driver.availability, 'ASSIGNED', 'driver committed');
      } finally {
        await dispose();
      }
    });

    runner.test('an under-qualified driver is refused and nothing is written', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        await app.services.dispatch.acceptOrder(S.HCM_BRANCH, orderId, 'Le Van Minh');

        // 'veh_000007' is a 20ft container needing class FC; 'drv_000002' holds class C.
        await Expect.throws(
          () =>
            app.services.dispatch.assignResources(
              S.HCM_BRANCH,
              orderId,
              [{ vehicleId: 'veh_000007', driverId: 'drv_000002' }],
              'Le Van Minh',
            ),
          'licence',
          'licence class enforced',
        );
        Expect.equals(await app.repositories.itineraries.count(), 0, 'no itinerary was created');
      } finally {
        await dispose();
      }
    });

    runner.test('a rejection records its reason and releases the held capacity', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        await app.services.dispatch.rejectOrder(S.HCM_BRANCH, orderId, 'Le Van Minh', 'Address could not be verified');

        const order = await app.repositories.orders.requireById(orderId);
        Expect.equals(order.status, 'REJECTED', 'rejected');
        Expect.defined(order.rejectionReason, 'reason recorded');

        const holds = await app.repositories.holds.findForOrder(orderId);
        Expect.isTrue(holds.every((hold) => hold.isReleased), 'capacity returned to the pool');
      } finally {
        await dispose();
      }
    });

    runner.test('dispatch issues an itemised invoice matching the agreed quote', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { invoiceId } = await S.dispatchOrder(app, orderId);

        const invoice = await app.repositories.invoices.requireById(invoiceId);
        const order = await app.repositories.orders.requireById(orderId);
        Expect.isTrue(invoice.lines.length >= 3, 'itemised, not a single figure');
        Expect.equals(invoice.total().amount, order.quotedPrice.amount, 'the bill equals the quote the customer agreed');
      } finally {
        await dispose();
      }
    });
  });

  // ------------------------------------------------------------- Scenario 3
}
