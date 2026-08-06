import { Expect } from './TestRunner.ts';
import type { TestRunner } from './TestRunner.ts';
import * as D from './DomainTestFixtures.ts';
import * as S from './ScenarioTestFixtures.ts';

/** Executable tests grouped by SmartFM business area. */
export function registerTrackingDomainTests(runner: TestRunner): void {
  runner.suite('Tracking — immutable, ordered history (A1 Task 8)', () => {
    const dispatchedOrder = (): D.ShipmentOrder => {
      const order = D.sampleOrder();
      order.accept('staff', D.NOW);
      order.attachItinerary('itn_000001', D.NOW, 'staff');
      order.dispatch('staff', D.NOW);
      return order;
    };

    const update = (state: 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED', at: Date, itineraryId = 'itn_000001'): D.TrackingUpdate =>
      D.TrackingUpdate.create({
        id: `trk_${state}`,
        orderId: 'ord_test',
        itineraryId,
        recordedByDriverId: 'drv_000001',
        recordedAt: at,
        state,
        locationLabel: 'Ho Chi Minh City',
      });

    runner.test('a driver not on this shipment cannot post an update', async () => {
      const order = dispatchedOrder();
      await Expect.throws(
        () => order.appendTracking(update('PICKED_UP', D.NOW, 'itn_other')),
        'Only a driver on an itinerary',
        'unassigned itinerary refused',
      );
    });

    runner.test('a checkpoint cannot pre-date the previous one', async () => {
      const order = dispatchedOrder();
      order.appendTracking(update('PICKED_UP', new Date(D.NOW.getTime() + 2 * 60 * 60 * 1000)));
      await Expect.throws(
        () => order.appendTracking(update('IN_TRANSIT', D.NOW)),
        'cannot be dated before',
        'chronological order enforced',
      );
    });

    runner.test('a pickup checkpoint advances the order to IN_TRANSIT', () => {
      const order = dispatchedOrder();
      order.appendTracking(update('PICKED_UP', D.NOW));
      Expect.equals(order.status, 'IN_TRANSIT', 'lifecycle advanced by the checkpoint');
    });

    runner.test('a delivered checkpoint completes the order and records on-time delivery', () => {
      const order = dispatchedOrder();
      order.appendTracking(update('PICKED_UP', D.NOW));
      order.appendTracking(update('DELIVERED', new Date(D.NOW.getTime() + 2 * D.DAY)));
      Expect.equals(order.status, 'DELIVERED', 'order delivered');
      Expect.equals(order.wasDeliveredOnTime(), true, 'delivered before the deadline');
    });

    runner.test('tracking updates are frozen after creation', () => {
      const created = update('PICKED_UP', D.NOW);
      Expect.isTrue(Object.isFrozen(created), 'TrackingUpdate instances are immutable');
    });

    runner.test('no tracking is accepted for an order that is not under way', async () => {
      // The itinerary is attached, so the ownership check passes and it is the
      // lifecycle rule alone that refuses the update.
      const order = D.sampleOrder();
      order.attachItinerary('itn_000001', D.NOW, 'staff');
      await Expect.throws(
        () => order.appendTracking(update('PICKED_UP', D.NOW)),
        'only accepted for a shipment that is under way',
        'pending order refuses tracking',
      );
    });
  });

}

export function registerTrackingScenarioTests(runner: TestRunner): void {
  runner.suite('Scenario 3 — Track a shipment (A1 Task 8)', () => {
    runner.test('the driver sees only their own live jobs', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { driverId } = await S.dispatchOrder(app, orderId);

        const jobs = await app.services.tracking.jobsForDriver(driverId);
        Expect.equals(jobs.length, 1, 'one job');
        Expect.equals(jobs[0]?.orderId, orderId, 'the dispatched order');

        const otherJobs = await app.services.tracking.jobsForDriver('drv_000006');
        Expect.equals(otherJobs.length, 0, 'a driver at another branch sees nothing');
      } finally {
        await dispose();
      }
    });

    runner.test('checkpoints build an ordered timeline the customer can read', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { driverId, itineraryId } = await S.dispatchOrder(app, orderId);

        clock.advanceDays(1);
        await app.services.tracking.recordUpdate(driverId, {
          itineraryId,
          state: 'PICKED_UP',
          locationLabel: 'Ho Chi Minh City',
        });
        clock.advanceMinutes(600);
        await app.services.tracking.recordUpdate(driverId, {
          itineraryId,
          state: 'IN_TRANSIT',
          locationLabel: 'Nha Trang',
          estimatedArrival: new Date(clock.now().getTime() + 12 * 60 * 60 * 1000).toISOString(),
        });

        const timeline = await app.services.tracking.timelineForCustomer(S.CUSTOMER_ONE, orderId);
        Expect.equals(timeline.entries.length, 2, 'two checkpoints');
        Expect.equals(timeline.statusLabel, 'In transit', 'plain-language status');
        Expect.isTrue(timeline.entries[0]?.description.includes('Picked up') === true, 'readable description');
      } finally {
        await dispose();
      }
    });

    runner.test('a customer cannot see another customer’s timeline (variant 1a)', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        await Expect.throws(
          () => app.services.tracking.timelineForCustomer(S.CUSTOMER_TWO, orderId),
          'No matching shipment',
          'no data leaks between customers',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a driver cannot post to an itinerary that is not theirs', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { itineraryId } = await S.dispatchOrder(app, orderId);
        await Expect.throws(
          () =>
            app.services.tracking.recordUpdate('drv_000006', {
              itineraryId,
              state: 'PICKED_UP',
              locationLabel: 'Da Nang',
            }),
          'assigned to another driver',
          'itinerary ownership enforced',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a delay revises the ETA without rewriting history (variant 2a)', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { driverId, itineraryId } = await S.dispatchOrder(app, orderId);

        clock.advanceDays(1);
        await app.services.tracking.recordUpdate(driverId, {
          itineraryId,
          state: 'PICKED_UP',
          locationLabel: 'Ho Chi Minh City',
        });
        clock.advanceMinutes(120);
        await app.services.tracking.recordUpdate(driverId, {
          itineraryId,
          state: 'DELAYED',
          locationLabel: 'Nha Trang',
          note: 'Highway closure on QL1A',
          estimatedArrival: new Date(clock.now().getTime() + 30 * 60 * 60 * 1000).toISOString(),
        });

        const order = await app.repositories.orders.requireById(orderId);
        Expect.equals(order.trackingHistory.length, 2, 'the delay was appended, not overwritten');
        Expect.equals(order.status, 'IN_TRANSIT', 'a delay does not change the lifecycle state');

        const timeline = await app.services.tracking.timelineForCustomer(S.CUSTOMER_ONE, orderId);
        Expect.equals(timeline.statusLabel, 'Delayed', 'the customer is told about the delay');
      } finally {
        await dispose();
      }
    });

    runner.test('delivery completes the itinerary and frees the vehicle and driver', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { driverId, itineraryId } = await S.dispatchOrder(app, orderId);

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

        const order = await app.repositories.orders.requireById(orderId);
        Expect.equals(order.status, 'DELIVERED', 'order delivered');

        const itinerary = await app.repositories.itineraries.requireById(itineraryId);
        Expect.equals(itinerary.status, 'COMPLETED', 'itinerary completed');

        const vehicle = await app.repositories.vehicles.requireById(itinerary.vehicleId);
        Expect.equals(vehicle.status, 'AVAILABLE', 'vehicle back in the pool');
        Expect.isTrue(vehicle.odometerKm > 0, 'the trip distance was added to the odometer');

        const driver = await app.repositories.drivers.requireById(driverId);
        Expect.equals(driver.availability, 'AVAILABLE', 'driver back in the pool');
      } finally {
        await dispose();
      }
    });

    runner.test('the customer receives notifications for the events they opted into', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        await S.dispatchOrder(app, orderId);

        const inbox = app.services.notifications.inboxFor(S.CUSTOMER_ONE);
        Expect.isTrue(inbox.length > 0, 'messages were raised');
        Expect.isTrue(
          inbox.some((message) => message.event === 'ORDER_DISPATCHED'),
          'the dispatch event reached the customer',
        );
      } finally {
        await dispose();
      }
    });
  });

}
