import { Expect } from './TestRunner.ts';
import type { TestRunner } from './TestRunner.ts';
import * as D from './DomainTestFixtures.ts';
import * as S from './ScenarioTestFixtures.ts';

/** Executable tests grouped by SmartFM business area. */
export function registerOrderDomainTests(runner: TestRunner): void {
  runner.suite('ShipmentOrder — lifecycle transition table (change C15)', () => {
    runner.test('a pending order may be accepted, rejected or cancelled — nothing else', () => {
      Expect.isTrue(D.OrderLifecycle.canTransition('PENDING', 'ACCEPTED'), 'accept allowed');
      Expect.isTrue(D.OrderLifecycle.canTransition('PENDING', 'CANCELLED'), 'cancel allowed');
      Expect.isFalse(D.OrderLifecycle.canTransition('PENDING', 'DELIVERED'), 'delivery not allowed from pending');
    });

    runner.test('a delivered order is terminal', () => {
      Expect.isTrue(D.OrderLifecycle.isTerminal('DELIVERED'), 'no transitions out of DELIVERED');
      Expect.isTrue(D.OrderLifecycle.isTerminal('REJECTED'), 'no transitions out of REJECTED');
    });

    runner.test('an order cannot be dispatched before resources are assigned', async () => {
      const order = D.sampleOrder();
      order.accept('staff.hcm@abctrans.example', D.NOW);
      await Expect.throws(() => order.dispatch('staff', D.NOW), 'no vehicle or driver', 'dispatch blocked');
    });

    runner.test('a dispatched order can no longer be cancelled online (A1 Task 6 variant 5a)', async () => {
      const order = D.sampleOrder();
      order.accept('staff', D.NOW);
      order.attachItinerary('itn_000001', D.NOW, 'staff');
      order.dispatch('staff', D.NOW);
      await Expect.throws(() => order.cancel('Customer', 'changed my mind', D.NOW), 'no longer be cancelled', 'cancel blocked');
    });

    runner.test('a rejection always records its reason', async () => {
      const order = D.sampleOrder();
      await Expect.throws(() => order.reject('staff', '', D.NOW), 'reason', 'blank reason refused');
      order.reject('staff', 'Delivery address could not be verified', D.NOW);
      Expect.equals(order.status, 'REJECTED', 'status recorded');
      Expect.defined(order.rejectionReason, 'reason retained');
    });

    runner.test('every transition is written to the change history (change C6)', () => {
      const order = D.sampleOrder();
      order.accept('staff', D.NOW);
      order.attachItinerary('itn_000001', D.NOW, 'staff');
      order.dispatch('staff', D.NOW);
      Expect.isTrue(order.changeHistory.length >= 3, 'accept, assign and dispatch all recorded');
      Expect.equals(order.changeHistory[0]?.toStatus, 'ACCEPTED', 'first entry is the acceptance');
    });

    runner.test('amendment is refused once the order is dispatched', async () => {
      const order = D.sampleOrder();
      order.accept('staff', D.NOW);
      order.attachItinerary('itn_000001', D.NOW, 'staff');
      order.dispatch('staff', D.NOW);
      await Expect.throws(
        () => order.amendDelivery({ recipientName: 'Someone Else' }, 'Customer', D.NOW),
        'no longer be changed',
        'amendment blocked',
      );
    });

    runner.test('amendment succeeds while pending and is recorded', () => {
      const order = D.sampleOrder();
      order.amendDelivery({ recipientName: 'Nguyen Van Long' }, 'Customer', D.NOW);
      Expect.equals(order.delivery.recipientName, 'Nguyen Van Long', 'new recipient stored');
      Expect.isTrue(
        order.changeHistory.some((entry) => entry.summary.includes('amended')),
        'amendment recorded in history',
      );
    });

    runner.test('a customer cannot read another customer’s order (A1 Task 8 variant 1a)', async () => {
      const order = D.sampleOrder();
      await Expect.throws(() => order.assertOwnedBy('cus_999999'), 'No matching shipment', 'ownership enforced');
    });
  });

}

export function registerCapacityHoldDomainTests(runner: TestRunner): void {
  runner.suite('CapacityHold — the reservation Assignment 2 never named (C14)', () => {
    runner.test('a fresh hold blocks other customers', () => {
      const hold = new D.CapacityHold({ id: 'hld_1', vehicleId: 'veh_1', customerId: 'cus_1', heldFrom: D.NOW });
      Expect.isTrue(hold.isActive(D.NOW), 'active immediately');
      Expect.equals(hold.minutesRemaining(D.NOW), 15, 'fifteen-minute window');
    });

    runner.test('a hold expires on its own after fifteen minutes', async () => {
      const hold = new D.CapacityHold({ id: 'hld_1', vehicleId: 'veh_1', customerId: 'cus_1', heldFrom: D.NOW });
      const later = new Date(D.NOW.getTime() + 16 * 60_000);
      Expect.isFalse(hold.isActive(later), 'expired');
      await Expect.throws(() => hold.assertStillValid(later), 'expired', 'expiry explained to the customer');
    });

    runner.test('a released hold returns capacity immediately (change of mind)', async () => {
      const hold = new D.CapacityHold({ id: 'hld_1', vehicleId: 'veh_1', customerId: 'cus_1', heldFrom: D.NOW });
      hold.release();
      await Expect.throws(() => hold.assertStillValid(D.NOW), 'released', 'released hold refused');
    });
  });

}

export function registerOrderPlacementScenarioTests(runner: TestRunner): void {
  runner.suite('Scenario 1 — Place a shipment order (A1 Tasks 4 and 5)', () => {
    runner.test('availability search returns priced options across branches', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const result = await app.services.orders.searchAvailability({
          cargo: S.cargo(),
          delivery: S.delivery(clock),
          preferredBranchId: S.HCM_BRANCH,
        });
        Expect.isTrue(result.options.length > 0, 'at least one option');
        const first = Expect.defined(result.options[0], 'first option');
        Expect.equals(first.branchId, S.HCM_BRANCH, 'the preferred branch is listed first');
        Expect.isTrue(first.priceDong > 0, 'a price is quoted');
        Expect.isTrue(first.distanceKm === 960, 'the HCM-Da Nang lane is 960 km');
      } finally {
        await dispose();
      }
    });

    runner.test('an unserviceable delivery window is refused with a usable explanation', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        await Expect.throws(
          () =>
            app.services.orders.searchAvailability({
              cargo: S.cargo(),
              delivery: S.delivery(clock, {
                requiredDeliveryBy: new Date(clock.now().getTime() + S.DAY + 60 * 60 * 1000).toISOString(),
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
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const order = await app.repositories.orders.requireById(orderId);
        Expect.equals(order.status, 'PENDING', 'awaiting branch review');
        Expect.isTrue(order.reference.startsWith('SFM-2026-'), 'human reference issued');
        Expect.isTrue(order.quotedPrice.amount > 0, 'the agreed quote is stored on the order');
      } finally {
        await dispose();
      }
    });

    runner.test('the customer changes their mind: releasing a hold returns capacity at once', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const result = await app.services.orders.searchAvailability({
          cargo: S.cargo(),
          delivery: S.delivery(clock),
          preferredBranchId: S.HCM_BRANCH,
        });
        const option = Expect.defined(result.options[0], 'an option');
        const holds = await app.services.orders.reserveCapacity(
          S.CUSTOMER_ONE,
          option.vehicles.map((vehicle) => vehicle.id),
        );
        Expect.equals((await app.services.orders.activeReservations(S.CUSTOMER_ONE)).length, holds.length, 'held');

        const released = await app.services.orders.releaseReservation(
          S.CUSTOMER_ONE,
          holds.map((hold) => hold.id),
        );
        Expect.equals(released, holds.length, 'every hold released');
        Expect.equals((await app.services.orders.activeReservations(S.CUSTOMER_ONE)).length, 0, 'nothing still held');
      } finally {
        await dispose();
      }
    });

    runner.test('a second customer cannot take a vehicle the first is holding (Task 4 variant 5a)', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const result = await app.services.orders.searchAvailability({
          cargo: S.cargo(),
          delivery: S.delivery(clock),
          preferredBranchId: S.HCM_BRANCH,
        });
        const vehicleId = Expect.defined(result.options[0]?.vehicles[0]?.id, 'a vehicle to contend for');
        await app.services.orders.reserveCapacity(S.CUSTOMER_ONE, [vehicleId]);

        await Expect.throws(
          () => app.services.orders.reserveCapacity(S.CUSTOMER_TWO, [vehicleId]),
          'just reserved by another customer',
          'the capacity race is resolved, not ignored',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('an expired hold cannot be used to place an order (Task 5 variant 5a)', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const result = await app.services.orders.searchAvailability({
          cargo: S.cargo(),
          delivery: S.delivery(clock),
          preferredBranchId: S.HCM_BRANCH,
        });
        const vehicleId = Expect.defined(result.options[0]?.vehicles[0]?.id, 'a vehicle');
        const holds = await app.services.orders.reserveCapacity(S.CUSTOMER_ONE, [vehicleId]);

        clock.advanceMinutes(16);

        await Expect.throws(
          () =>
            app.services.orders.placeOrder(S.CUSTOMER_ONE, {
              branchId: S.HCM_BRANCH,
              holdIds: holds.map((hold) => hold.id),
              cargo: S.cargo(),
              delivery: S.delivery(clock),
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
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const result = await app.services.orders.searchAvailability({
          cargo: S.cargo({ unitCount: 10, unitWeightKg: 1_200, totalVolumeM3: 30 }),
          delivery: S.delivery(clock),
          preferredBranchId: S.HCM_BRANCH,
        });
        const option = Expect.defined(result.options.find((entry) => entry.branchId === S.HCM_BRANCH), 'an HCM option');
        Expect.isTrue(option.isSplitShipment, '12 tonnes needs more than one Ho Chi Minh vehicle');
        Expect.isTrue(option.vehicles.length > 1, 'several vehicles proposed');
      } finally {
        await dispose();
      }
    });
  });

}

export function registerOrderChangeScenarioTests(runner: TestRunner): void {
  runner.suite('Scenario 6 — Amend and cancel an order (A1 Task 6)', () => {
    runner.test('a pending order can be amended and is re-priced', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const before = await app.repositories.orders.requireById(orderId);

        const amended = await app.services.orders.amendOrder(S.CUSTOMER_ONE, orderId, {
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
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        await app.services.orders.cancelOrder(S.CUSTOMER_ONE, orderId, 'Customer no longer needs the shipment');

        const order = await app.repositories.orders.requireById(orderId);
        Expect.equals(order.status, 'CANCELLED', 'cancelled');

        const holds = await app.repositories.holds.findForOrder(orderId);
        Expect.isTrue(holds.every((hold) => hold.isReleased), 'reservations released');
      } finally {
        await dispose();
      }
    });

    runner.test('cancelling an accepted order frees the assigned vehicle and driver', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        await app.services.dispatch.acceptOrder(S.HCM_BRANCH, orderId, 'Le Van Minh');
        const suggestions = await app.services.dispatch.suggestAssignments(S.HCM_BRANCH, orderId);
        const first = Expect.defined(suggestions[0], 'a pairing');
        await app.services.dispatch.assignResources(
          S.HCM_BRANCH,
          orderId,
          [{ vehicleId: first.vehicleId, driverId: first.driverId }],
          'Le Van Minh',
        );

        await app.services.orders.cancelOrder(S.CUSTOMER_ONE, orderId, 'Customer cancelled before dispatch');

        const vehicle = await app.repositories.vehicles.requireById(first.vehicleId);
        Expect.equals(vehicle.status, 'AVAILABLE', 'vehicle released');
      } finally {
        await dispose();
      }
    });

    runner.test('a dispatched order cannot be cancelled online (variant 5a)', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        await S.dispatchOrder(app, orderId);
        await Expect.throws(
          () => app.services.orders.cancelOrder(S.CUSTOMER_ONE, orderId, 'Too late'),
          'no longer be cancelled',
          'self-service cancellation window closed',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a paid order abandoned after a failed delivery is refunded, and the receipt survives (variant 6a)', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { driverId, itineraryId, invoiceId } = await S.dispatchOrder(app, orderId);

        const invoice = await app.repositories.invoices.requireById(invoiceId);
        await app.services.billing.payInvoice(S.CUSTOMER_ONE, invoiceId, {
          method: 'CASH',
          cash: { branchId: S.HCM_BRANCH, cashierName: 'Le Van Minh', amountTendered: invoice.total().amount },
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

        await app.services.orders.cancelOrder(S.CUSTOMER_ONE, orderId, 'Recipient no longer accepting the shipment');

        const refunded = Expect.defined(await app.services.billing.refundForCancelledOrder(orderId), 'invoice');
        Expect.equals(refunded.status, 'REFUNDED', 'refund recorded against the settled invoice');
        Expect.equals(
          (await app.services.billing.listReceiptsForCustomer(S.CUSTOMER_ONE)).length,
          1,
          'the original receipt is preserved, not deleted',
        );
      } finally {
        await dispose();
      }
    });
  });

}
