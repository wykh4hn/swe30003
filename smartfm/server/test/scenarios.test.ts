import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Expect } from './TestRunner.ts';
import type { TestRunner } from './TestRunner.ts';
import { ApplicationContext } from '../infrastructure/ApplicationContext.ts';
import { FixedClock } from '../infrastructure/Clock.ts';
import type { AvailabilityOption } from '../application/OrderService.ts';

const START = new Date('2026-08-05T08:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const CUSTOMER_ONE = 'cus_000001';
const CUSTOMER_TWO = 'cus_000002';
const HCM_BRANCH = 'brn_000001';

/** Builds a throwaway application on a temporary data directory. */
async function freshApplication(): Promise<{ app: ApplicationContext; clock: FixedClock; dispose: () => Promise<void> }> {
  const directory = await mkdtemp(join(tmpdir(), 'smartfm-test-'));
  const clock = new FixedClock(START);
  const app = await ApplicationContext.create({ dataDirectory: directory, clock });
  return {
    app,
    clock,
    dispose: async () => {
      await rm(directory, { recursive: true, force: true });
    },
  };
}

function cargo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    description: 'Packaged retail goods',
    unitCount: 10,
    unitWeightKg: 200,
    totalVolumeM3: 12,
    handling: 'STANDARD',
    declaredValue: 50_000_000,
    ...overrides,
  };
}

function delivery(clock: FixedClock, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = clock.now();
  return {
    pickupAddress: { street: '210 Le Van Sy', district: 'Phu Nhuan', city: 'Ho Chi Minh City' },
    deliveryAddress: { street: '15 Ngo Quyen', district: 'Son Tra', city: 'Da Nang' },
    requestedPickupAt: new Date(now.getTime() + DAY).toISOString(),
    requiredDeliveryBy: new Date(now.getTime() + 4 * DAY).toISOString(),
    serviceLevel: 'STANDARD',
    recipientName: 'Tran Thi Bich',
    recipientPhone: '0909123456',
    ...overrides,
  };
}

/** Runs search -> reserve -> place and returns the resulting order id. */
async function placeOrder(
  app: ApplicationContext,
  clock: FixedClock,
  customerId = CUSTOMER_ONE,
  cargoOverrides: Record<string, unknown> = {},
): Promise<{ orderId: string; option: AvailabilityOption }> {
  const result = await app.services.orders.searchAvailability({
    cargo: cargo(cargoOverrides),
    delivery: delivery(clock),
    preferredBranchId: HCM_BRANCH,
  });
  const option = Expect.defined(
    result.options.find((candidate) => candidate.branchId === HCM_BRANCH),
    'an option at the Ho Chi Minh branch',
  );
  const holds = await app.services.orders.reserveCapacity(
    customerId,
    option.vehicles.map((vehicle) => vehicle.id),
  );
  const order = await app.services.orders.placeOrder(customerId, {
    branchId: HCM_BRANCH,
    holdIds: holds.map((hold) => hold.id),
    cargo: cargo(cargoOverrides),
    delivery: delivery(clock),
  });
  return { orderId: order.id, option };
}

/** Accepts, assigns and dispatches an order, returning the driver on leg 1. */
async function dispatchOrder(
  app: ApplicationContext,
  orderId: string,
): Promise<{ driverId: string; itineraryId: string; invoiceId: string }> {
  await app.services.dispatch.acceptOrder(HCM_BRANCH, orderId, 'Le Van Minh');
  const suggestions = await app.services.dispatch.suggestAssignments(HCM_BRANCH, orderId);
  const first = Expect.defined(suggestions[0], 'at least one legal vehicle/driver pairing');

  const itineraries = await app.services.dispatch.assignResources(
    HCM_BRANCH,
    orderId,
    [{ vehicleId: first.vehicleId, driverId: first.driverId }],
    'Le Van Minh',
  );
  await app.services.dispatch.dispatchOrder(HCM_BRANCH, orderId, 'Le Van Minh');

  const invoice = Expect.defined(await app.services.billing.findInvoiceForOrder(orderId), 'invoice issued on dispatch');
  return {
    driverId: first.driverId,
    itineraryId: Expect.defined(itineraries[0], 'first itinerary').id,
    invoiceId: invoice.id,
  };
}

/**
 * End-to-end scenario tests.
 *
 * These are the Assignment 2 verification scenarios re-run against the real
 * implementation, plus the extra business areas Assignment 3 covers. Each one
 * builds a complete `ApplicationContext` over a temporary data directory, so the
 * bootstrap process, the repositories, the file store and every service are all
 * exercised — not stubbed.
 */
export function registerScenarioTests(runner: TestRunner): void {
  runner.suite('Bootstrap — ApplicationContext (change C1)', () => {
    runner.test('the bootstrap sequence produces a fully wired application', async () => {
      const { app, dispose } = await freshApplication();
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
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const first = await app.repositories.orders.requireById(orderId);

        // Re-bootstrap over the same directory, exactly as restarting the server does.
        const restarted = await ApplicationContext.create({ dataDirectory: app.store.directoryPath, clock });
        Expect.isFalse(restarted.seeded, 'existing data is reused, not re-seeded');

        const { orderId: secondId } = await placeOrder(restarted, clock, CUSTOMER_TWO);
        Expect.isFalse(secondId === first.id, 'the restarted process issued a fresh identity');
      } finally {
        await dispose();
      }
    });
  });

  // ------------------------------------------------------------- Scenario 1

  runner.suite('Scenario 1 — Place a shipment order (A1 Tasks 4 and 5)', () => {
    runner.test('availability search returns priced options across branches', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const result = await app.services.orders.searchAvailability({
          cargo: cargo(),
          delivery: delivery(clock),
          preferredBranchId: HCM_BRANCH,
        });
        Expect.isTrue(result.options.length > 0, 'at least one option');
        const first = Expect.defined(result.options[0], 'first option');
        Expect.equals(first.branchId, HCM_BRANCH, 'the preferred branch is listed first');
        Expect.isTrue(first.priceDong > 0, 'a price is quoted');
        Expect.isTrue(first.distanceKm === 960, 'the HCM-Da Nang lane is 960 km');
      } finally {
        await dispose();
      }
    });

    runner.test('an unserviceable delivery window is refused with a usable explanation', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        await Expect.throws(
          () =>
            app.services.orders.searchAvailability({
              cargo: cargo(),
              delivery: delivery(clock, {
                requiredDeliveryBy: new Date(clock.now().getTime() + DAY + 60 * 60 * 1000).toISOString(),
              }),
            }),
          'delivery window',
          'an impossible deadline is rejected before an order exists',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('placing an order creates one pending order with a reference', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const order = await app.repositories.orders.requireById(orderId);
        Expect.equals(order.status, 'PENDING', 'awaiting branch review');
        Expect.isTrue(order.reference.startsWith('SFM-2026-'), 'human reference issued');
        Expect.isTrue(order.quotedPrice.amount > 0, 'the agreed quote is stored on the order');
      } finally {
        await dispose();
      }
    });

    runner.test('the customer changes their mind: releasing a hold returns capacity at once', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const result = await app.services.orders.searchAvailability({
          cargo: cargo(),
          delivery: delivery(clock),
          preferredBranchId: HCM_BRANCH,
        });
        const option = Expect.defined(result.options[0], 'an option');
        const holds = await app.services.orders.reserveCapacity(
          CUSTOMER_ONE,
          option.vehicles.map((vehicle) => vehicle.id),
        );
        Expect.equals((await app.services.orders.activeReservations(CUSTOMER_ONE)).length, holds.length, 'held');

        const released = await app.services.orders.releaseReservation(
          CUSTOMER_ONE,
          holds.map((hold) => hold.id),
        );
        Expect.equals(released, holds.length, 'every hold released');
        Expect.equals((await app.services.orders.activeReservations(CUSTOMER_ONE)).length, 0, 'nothing still held');
      } finally {
        await dispose();
      }
    });

    runner.test('a second customer cannot take a vehicle the first is holding (Task 4 variant 5a)', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const result = await app.services.orders.searchAvailability({
          cargo: cargo(),
          delivery: delivery(clock),
          preferredBranchId: HCM_BRANCH,
        });
        const vehicleId = Expect.defined(result.options[0]?.vehicles[0]?.id, 'a vehicle to contend for');
        await app.services.orders.reserveCapacity(CUSTOMER_ONE, [vehicleId]);

        await Expect.throws(
          () => app.services.orders.reserveCapacity(CUSTOMER_TWO, [vehicleId]),
          'just reserved by another customer',
          'the capacity race is resolved, not ignored',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('an expired hold cannot be used to place an order (Task 5 variant 5a)', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const result = await app.services.orders.searchAvailability({
          cargo: cargo(),
          delivery: delivery(clock),
          preferredBranchId: HCM_BRANCH,
        });
        const vehicleId = Expect.defined(result.options[0]?.vehicles[0]?.id, 'a vehicle');
        const holds = await app.services.orders.reserveCapacity(CUSTOMER_ONE, [vehicleId]);

        clock.advanceMinutes(16);

        await Expect.throws(
          () =>
            app.services.orders.placeOrder(CUSTOMER_ONE, {
              branchId: HCM_BRANCH,
              holdIds: holds.map((hold) => hold.id),
              cargo: cargo(),
              delivery: delivery(clock),
            }),
          'expired',
          'a stale reservation cannot be committed',
        );
        Expect.equals(await app.repositories.orders.count(), 0, 'no partial order was written');
      } finally {
        await dispose();
      }
    });

    runner.test('a load too heavy for one vehicle is offered as a split shipment (Task 5 variant 5b)', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const result = await app.services.orders.searchAvailability({
          cargo: cargo({ unitCount: 10, unitWeightKg: 1_200, totalVolumeM3: 30 }),
          delivery: delivery(clock),
          preferredBranchId: HCM_BRANCH,
        });
        const option = Expect.defined(result.options.find((entry) => entry.branchId === HCM_BRANCH), 'an HCM option');
        Expect.isTrue(option.isSplitShipment, '12 tonnes needs more than one Ho Chi Minh vehicle');
        Expect.isTrue(option.vehicles.length > 1, 'several vehicles proposed');
      } finally {
        await dispose();
      }
    });
  });

  // ------------------------------------------------------------- Scenario 2

  runner.suite('Scenario 2 — Process and dispatch an order (A1 Task 7)', () => {
    runner.test('the branch queue shows the pending order', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const queue = await app.services.dispatch.pendingQueue(HCM_BRANCH);
        Expect.equals(queue.length, 1, 'one order waiting');
        Expect.equals(queue[0]?.id, orderId, 'it is the order just placed');
      } finally {
        await dispose();
      }
    });

    runner.test('the review reports no blocking problems for a clean order', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const review = await app.services.dispatch.reviewOrder(HCM_BRANCH, orderId, 'Nguyen Thi Hoa');
        Expect.isTrue(review.canAccept, 'acceptable');
        Expect.equals(review.problems.length, 0, 'no problems');
      } finally {
        await dispose();
      }
    });

    runner.test('a likely duplicate raises a warning without blocking (variant 3b)', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        await placeOrder(app, clock);
        const { orderId } = await placeOrder(app, clock);
        const review = await app.services.dispatch.reviewOrder(HCM_BRANCH, orderId, 'Nguyen Thi Hoa');
        Expect.isTrue(review.warnings.some((text) => text.includes('duplicate')), 'duplicate flagged');
        Expect.isTrue(review.canAccept, 'a warning does not block the branch');
      } finally {
        await dispose();
      }
    });

    runner.test('another branch cannot process this branch’s order', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
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
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { itineraryId } = await dispatchOrder(app, orderId);

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
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        await app.services.dispatch.acceptOrder(HCM_BRANCH, orderId, 'Le Van Minh');

        // 'veh_000007' is a 20ft container needing class FC; 'drv_000002' holds class C.
        await Expect.throws(
          () =>
            app.services.dispatch.assignResources(
              HCM_BRANCH,
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
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        await app.services.dispatch.rejectOrder(HCM_BRANCH, orderId, 'Le Van Minh', 'Address could not be verified');

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
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { invoiceId } = await dispatchOrder(app, orderId);

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

  runner.suite('Scenario 3 — Track a shipment (A1 Task 8)', () => {
    runner.test('the driver sees only their own live jobs', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { driverId } = await dispatchOrder(app, orderId);

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
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { driverId, itineraryId } = await dispatchOrder(app, orderId);

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

        const timeline = await app.services.tracking.timelineForCustomer(CUSTOMER_ONE, orderId);
        Expect.equals(timeline.entries.length, 2, 'two checkpoints');
        Expect.equals(timeline.statusLabel, 'In transit', 'plain-language status');
        Expect.isTrue(timeline.entries[0]?.description.includes('Picked up') === true, 'readable description');
      } finally {
        await dispose();
      }
    });

    runner.test('a customer cannot see another customer’s timeline (variant 1a)', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        await Expect.throws(
          () => app.services.tracking.timelineForCustomer(CUSTOMER_TWO, orderId),
          'No matching shipment',
          'no data leaks between customers',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a driver cannot post to an itinerary that is not theirs', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { itineraryId } = await dispatchOrder(app, orderId);
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
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { driverId, itineraryId } = await dispatchOrder(app, orderId);

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

        const timeline = await app.services.tracking.timelineForCustomer(CUSTOMER_ONE, orderId);
        Expect.equals(timeline.statusLabel, 'Delayed', 'the customer is told about the delay');
      } finally {
        await dispose();
      }
    });

    runner.test('delivery completes the itinerary and frees the vehicle and driver', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { driverId, itineraryId } = await dispatchOrder(app, orderId);

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
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        await dispatchOrder(app, orderId);

        const inbox = app.services.notifications.inboxFor(CUSTOMER_ONE);
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

  // ------------------------------------------------------------- Scenario 4

  runner.suite('Scenario 4 — Pay an invoice and receive a receipt (A1 Task 9)', () => {
    runner.test('a declined card leaves the invoice outstanding and the attempt on record', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { invoiceId } = await dispatchOrder(app, orderId);

        const outcome = await app.services.billing.payInvoice(CUSTOMER_ONE, invoiceId, {
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
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { invoiceId } = await dispatchOrder(app, orderId);
        const invoice = await app.repositories.invoices.requireById(invoiceId);

        await app.services.billing.payInvoice(CUSTOMER_ONE, invoiceId, {
          method: 'CARD',
          card: { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '0000', expiryMonth: 12, expiryYear: 2030 },
        });

        const outcome = await app.services.billing.payInvoice(CUSTOMER_ONE, invoiceId, {
          method: 'CASH',
          cash: { branchId: HCM_BRANCH, cashierName: 'Le Van Minh', amountTendered: invoice.total().amount },
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
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { invoiceId } = await dispatchOrder(app, orderId);

        const outcome = await app.services.billing.payInvoice(CUSTOMER_ONE, invoiceId, {
          method: 'CASH',
          cash: { branchId: HCM_BRANCH, cashierName: 'Le Van Minh', amountTendered: 1_000 },
        });
        Expect.isFalse(outcome.succeeded, 'refused');
        Expect.isTrue(outcome.retryable, 'the customer can collect the balance and try again');
      } finally {
        await dispose();
      }
    });

    runner.test('a settled invoice cannot be paid twice', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { invoiceId } = await dispatchOrder(app, orderId);
        const invoice = await app.repositories.invoices.requireById(invoiceId);
        const cash = { branchId: HCM_BRANCH, cashierName: 'Le Van Minh', amountTendered: invoice.total().amount };

        await app.services.billing.payInvoice(CUSTOMER_ONE, invoiceId, { method: 'CASH', cash });
        await Expect.throws(
          () => app.services.billing.payInvoice(CUSTOMER_ONE, invoiceId, { method: 'CASH', cash }),
          'already been paid',
          'double settlement refused',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('another customer cannot pay, or even see, this invoice', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { invoiceId } = await dispatchOrder(app, orderId);
        await Expect.throws(
          () =>
            app.services.billing.payInvoice(CUSTOMER_TWO, invoiceId, {
              method: 'CASH',
              cash: { branchId: HCM_BRANCH, cashierName: 'Le Van Minh', amountTendered: 999_999_999 },
            }),
          'not found',
          'ownership enforced on billing too',
        );
      } finally {
        await dispose();
      }
    });
  });

  // ------------------------------------------------------------- Scenario 5

  runner.suite('Scenario 5 — Fleet and driver management (A1 Tasks 1 and 2)', () => {
    runner.test('a vehicle is registered, and a duplicate plate is refused', async () => {
      const { app, dispose } = await freshApplication();
      try {
        const vehicle = await app.services.fleet.registerVehicle({
          registration: '51C-999.11',
          type: 'TRUCK_5T',
          branchId: HCM_BRANCH,
          odometerKm: 1_000,
        });
        Expect.equals(vehicle.registration, '51C-999.11', 'registered');

        await Expect.throws(
          () =>
            app.services.fleet.registerVehicle({
              registration: '51c-999.11',
              type: 'VAN',
              branchId: HCM_BRANCH,
            }),
          'already on file',
          'duplicate plate refused regardless of case',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a vehicle on an active itinerary cannot be retired', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { itineraryId } = await dispatchOrder(app, orderId);
        const itinerary = await app.repositories.itineraries.requireById(itineraryId);

        await Expect.throws(
          () => app.services.fleet.retireVehicle(itinerary.vehicleId),
          'cannot be retired',
          'retirement blocked end to end',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a driver on an active itinerary cannot be deactivated', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { driverId } = await dispatchOrder(app, orderId);

        await Expect.throws(
          () => app.services.fleet.deactivateDriver(driverId),
          'active itinerary',
          'deactivation blocked end to end',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a vehicle in maintenance is excluded from availability search', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const before = await app.services.orders.searchAvailability({
          cargo: cargo(),
          delivery: delivery(clock),
          preferredBranchId: HCM_BRANCH,
        });
        const vehicleId = Expect.defined(before.options[0]?.vehicles[0]?.id, 'a vehicle');

        await app.services.fleet.sendVehicleToMaintenance(vehicleId, 'Scheduled brake service');

        const after = await app.services.orders.searchAvailability({
          cargo: cargo(),
          delivery: delivery(clock),
          preferredBranchId: HCM_BRANCH,
        });
        const stillOffered = after.options.some((option) =>
          option.vehicles.some((vehicle) => vehicle.id === vehicleId),
        );
        Expect.isFalse(stillOffered, 'a vehicle in maintenance is not offered to customers');
      } finally {
        await dispose();
      }
    });
  });

  // ------------------------------------------------------------- Scenario 6

  runner.suite('Scenario 6 — Amend and cancel an order (A1 Task 6)', () => {
    runner.test('a pending order can be amended and is re-priced', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const before = await app.repositories.orders.requireById(orderId);

        const amended = await app.services.orders.amendOrder(CUSTOMER_ONE, orderId, {
          deliveryAddress: { street: '99 Tran Phu', district: 'Hai Chau', city: 'Nha Trang' },
        });
        Expect.equals(amended.delivery.deliveryAddress.city, 'Nha Trang', 'destination changed');
        Expect.isFalse(
          amended.quotedPrice.amount === before.quotedPrice.amount,
          'a shorter lane produces a different quote',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('cancelling a pending order releases its reservations', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        await app.services.orders.cancelOrder(CUSTOMER_ONE, orderId, 'Customer no longer needs the shipment');

        const order = await app.repositories.orders.requireById(orderId);
        Expect.equals(order.status, 'CANCELLED', 'cancelled');

        const holds = await app.repositories.holds.findForOrder(orderId);
        Expect.isTrue(holds.every((hold) => hold.isReleased), 'reservations released');
      } finally {
        await dispose();
      }
    });

    runner.test('cancelling an accepted order frees the assigned vehicle and driver', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        await app.services.dispatch.acceptOrder(HCM_BRANCH, orderId, 'Le Van Minh');
        const suggestions = await app.services.dispatch.suggestAssignments(HCM_BRANCH, orderId);
        const first = Expect.defined(suggestions[0], 'a pairing');
        await app.services.dispatch.assignResources(
          HCM_BRANCH,
          orderId,
          [{ vehicleId: first.vehicleId, driverId: first.driverId }],
          'Le Van Minh',
        );

        await app.services.orders.cancelOrder(CUSTOMER_ONE, orderId, 'Customer cancelled before dispatch');

        const vehicle = await app.repositories.vehicles.requireById(first.vehicleId);
        Expect.equals(vehicle.status, 'AVAILABLE', 'vehicle released');
      } finally {
        await dispose();
      }
    });

    runner.test('a dispatched order cannot be cancelled online (variant 5a)', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        await dispatchOrder(app, orderId);
        await Expect.throws(
          () => app.services.orders.cancelOrder(CUSTOMER_ONE, orderId, 'Too late'),
          'no longer be cancelled',
          'self-service cancellation window closed',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a paid order abandoned after a failed delivery is refunded, and the receipt survives (variant 6a)', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { driverId, itineraryId, invoiceId } = await dispatchOrder(app, orderId);

        const invoice = await app.repositories.invoices.requireById(invoiceId);
        await app.services.billing.payInvoice(CUSTOMER_ONE, invoiceId, {
          method: 'CASH',
          cash: { branchId: HCM_BRANCH, cashierName: 'Le Van Minh', amountTendered: invoice.total().amount },
        });

        // The delivery fails, which is the one state after dispatch from which
        // the lifecycle table still permits cancellation.
        clock.advanceDays(1);
        await app.services.tracking.recordUpdate(driverId, {
          itineraryId,
          state: 'PICKED_UP',
          locationLabel: 'Ho Chi Minh City',
        });
        clock.advanceDays(1);
        await app.services.tracking.recordUpdate(driverId, {
          itineraryId,
          state: 'FAILED_ATTEMPT',
          locationLabel: 'Da Nang',
          note: 'Recipient premises closed, no alternative contact',
        });

        await app.services.orders.cancelOrder(CUSTOMER_ONE, orderId, 'Recipient no longer accepting the shipment');

        const refunded = Expect.defined(await app.services.billing.refundForCancelledOrder(orderId), 'invoice');
        Expect.equals(refunded.status, 'REFUNDED', 'refund recorded against the settled invoice');
        Expect.equals(
          (await app.services.billing.listReceiptsForCustomer(CUSTOMER_ONE)).length,
          1,
          'the original receipt is preserved, not deleted',
        );
      } finally {
        await dispose();
      }
    });
  });

  // ------------------------------------------------------------- Scenario 7

  runner.suite('Scenario 7 — Management reporting (A1 Task 10)', () => {
    runner.test('an empty period returns a no-data report, not an error (variant 1b)', async () => {
      const { app, dispose } = await freshApplication();
      try {
        const report = await app.services.reporting.shipmentStatistics({ preset: 'DAY' });
        Expect.isTrue(report.isEmpty(), 'no activity today');
        Expect.isTrue(report.headline().includes('No shipment activity'), 'a readable result');
      } finally {
        await dispose();
      }
    });

    runner.test('shipment statistics count a delivered order and its collected revenue', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { driverId, itineraryId, invoiceId } = await dispatchOrder(app, orderId);

        const invoice = await app.repositories.invoices.requireById(invoiceId);
        await app.services.billing.payInvoice(CUSTOMER_ONE, invoiceId, {
          method: 'CASH',
          cash: { branchId: HCM_BRANCH, cashierName: 'Le Van Minh', amountTendered: invoice.total().amount },
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

        const report = await app.services.reporting.shipmentStatistics({ preset: 'MONTH', branchId: HCM_BRANCH });
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
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { itineraryId } = await dispatchOrder(app, orderId);
        const itinerary = await app.repositories.itineraries.requireById(itineraryId);

        const report = await app.services.reporting.resourceUtilisation({ preset: 'MONTH', branchId: HCM_BRANCH });
        Expect.equals(report.totalItineraries, 1, 'one itinerary in the period');

        const workedRow = report.vehicleRows.find((row) => row.resourceId === itinerary.vehicleId);
        Expect.isTrue((workedRow?.committedHours ?? 0) > 0, 'committed hours recorded');
        Expect.isTrue(report.idleVehicles().length >= 1, 'unused vehicles are surfaced for redeployment');
      } finally {
        await dispose();
      }
    });

    runner.test('the cross-branch view covers every branch (subtask 3)', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        await placeOrder(app, clock);
        const scoped = await app.services.reporting.resourceUtilisation({ preset: 'MONTH', branchId: HCM_BRANCH });
        const all = await app.services.reporting.resourceUtilisation({ preset: 'MONTH' });
        Expect.isTrue(all.vehicleRows.length > scoped.vehicleRows.length, 'the national view is wider');
        Expect.equals(all.scopeLabel, 'All branches', 'scope stated on the report');
      } finally {
        await dispose();
      }
    });
  });

  // ------------------------------------------------------------- Scenario 8

  runner.suite('Scenario 8 — Customer account management (A1 Task 3)', () => {
    runner.test('a new customer registers and can immediately sign in', async () => {
      const { app, dispose } = await freshApplication();
      try {
        const customer = await app.services.accounts.register({
          fullName: 'Pham Thi Ngoc',
          companyName: 'Ngoc Trading Co',
          email: 'ngoc.pham@ngoctrading.example',
          phone: '0977888999',
          password: 'ngoc-password-2026',
          billingAddress: { street: '12 Hai Ba Trung', district: 'District 1', city: 'Ho Chi Minh City' },
        });
        Expect.equals(customer.accountStatus, 'ACTIVE', 'verified and active');

        const session = await app.services.auth.signIn('ngoc.pham@ngoctrading.example', 'ngoc-password-2026');
        Expect.equals(session.role, 'CUSTOMER', 'signed in as a customer');
      } finally {
        await dispose();
      }
    });

    runner.test('registering twice with the same email is refused (variant 1a)', async () => {
      const { app, dispose } = await freshApplication();
      try {
        await Expect.throws(
          () =>
            app.services.accounts.register({
              fullName: 'Someone Else',
              email: 'hoa.nguyen@hoaphat.example',
              phone: '0977000111',
              password: 'another-password',
              billingAddress: { street: '1 Some Street', district: 'District 1', city: 'Ho Chi Minh City' },
            }),
          'already exists',
          'duplicate registration redirected to sign-in',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a wrong password is refused without revealing whether the user exists', async () => {
      const { app, dispose } = await freshApplication();
      try {
        await Expect.throws(
          () => app.services.auth.signIn('hoa.nguyen@hoaphat.example', 'wrong-password'),
          'email address or password is incorrect',
          'no user enumeration',
        );
        await Expect.throws(
          () => app.services.auth.signIn('nobody@nowhere.example', 'wrong-password'),
          'email address or password is incorrect',
          'identical message for an unknown user',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('an account cannot be closed while an order is open (variant 5a)', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        await placeOrder(app, clock);
        await Expect.throws(
          () => app.services.accounts.closeAccount(CUSTOMER_ONE),
          'still active',
          'closure blocked while work is outstanding',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a clean account closes and its history is preserved', async () => {
      const { app, dispose } = await freshApplication();
      try {
        const customer = await app.services.accounts.closeAccount(CUSTOMER_TWO);
        Expect.equals(customer.accountStatus, 'CLOSED', 'closed');
        Expect.defined(await app.repositories.customers.findById(CUSTOMER_TWO), 'the record still exists');
      } finally {
        await dispose();
      }
    });
  });

  // ---------------------------------------------------------------- persistence

  runner.suite('Persistence — repositories and the JSON file store (change C10)', () => {
    runner.test('an order survives a full round trip through storage', async () => {
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { driverId, itineraryId } = await dispatchOrder(app, orderId);

        clock.advanceDays(1);
        await app.services.tracking.recordUpdate(driverId, {
          itineraryId,
          state: 'PICKED_UP',
          locationLabel: 'Ho Chi Minh City',
          note: 'Loaded at dock 3',
        });

        const reloaded = await ApplicationContext.create({
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
      const { app, clock, dispose } = await freshApplication();
      try {
        const { orderId } = await placeOrder(app, clock);
        const { invoiceId } = await dispatchOrder(app, orderId);
        const invoice = await app.repositories.invoices.requireById(invoiceId);

        await app.services.billing.payInvoice(CUSTOMER_ONE, invoiceId, {
          method: 'CARD',
          card: { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '4242', expiryMonth: 12, expiryYear: 2030 },
        });

        const reloaded = await ApplicationContext.create({
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
