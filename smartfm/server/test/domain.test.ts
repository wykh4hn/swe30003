import { Expect } from './TestRunner.ts';
import type { TestRunner } from './TestRunner.ts';

import { Money } from '../domain/shared/Money.ts';
import { Address } from '../domain/shared/Address.ts';
import { ContactInfo } from '../domain/shared/ContactInfo.ts';
import { DateRange } from '../domain/shared/DateRange.ts';
import { Guard } from '../domain/shared/Guard.ts';

import { Customer } from '../domain/people/Customer.ts';
import { Driver } from '../domain/people/Driver.ts';
import { Vehicle } from '../domain/fleet/Vehicle.ts';
import type { VehicleType } from '../domain/fleet/Vehicle.ts';
import { Branch } from '../domain/fleet/Branch.ts';

import { CargoDetails } from '../domain/ordering/CargoDetails.ts';
import { DeliveryDetails } from '../domain/ordering/DeliveryDetails.ts';
import { ShipmentOrder } from '../domain/ordering/ShipmentOrder.ts';
import { OrderLifecycle } from '../domain/ordering/OrderStatus.ts';
import type { OrderStatus } from '../domain/ordering/OrderStatus.ts';
import { CapacityHold } from '../domain/ordering/CapacityHold.ts';

import { Itinerary } from '../domain/dispatch/Itinerary.ts';
import { Route } from '../domain/dispatch/Route.ts';
import { RouteLeg } from '../domain/dispatch/RouteLeg.ts';
import { Waypoint } from '../domain/dispatch/Waypoint.ts';

import { Invoice } from '../domain/billing/Invoice.ts';
import { InvoiceLine } from '../domain/billing/InvoiceLine.ts';
import { Payment } from '../domain/billing/Payment.ts';
import { CashPayment } from '../domain/billing/CashPayment.ts';
import { CardPayment } from '../domain/billing/CardPayment.ts';

import { TrackingUpdate } from '../domain/tracking/TrackingUpdate.ts';
import { ReportPeriod } from '../domain/reporting/ReportPeriod.ts';
import { ShipmentStatisticsReport } from '../domain/reporting/ShipmentStatisticsReport.ts';

const NOW = new Date('2026-08-05T08:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function hcmAddress(): Address {
  return Address.create({ street: '210 Le Van Sy', district: 'Phu Nhuan', city: 'Ho Chi Minh City' });
}

function sampleCargo(weightKg = 2_000): CargoDetails {
  return CargoDetails.create({
    description: 'Packaged retail goods',
    unitCount: 10,
    unitWeightKg: weightKg / 10,
    totalVolumeM3: 12,
    handling: 'STANDARD',
    declaredValue: 50_000_000,
  });
}

function sampleDelivery(): DeliveryDetails {
  return DeliveryDetails.create(
    {
      pickupAddress: { street: '210 Le Van Sy', district: 'Phu Nhuan', city: 'Ho Chi Minh City' },
      deliveryAddress: { street: '15 Ngo Quyen', district: 'Son Tra', city: 'Da Nang' },
      requestedPickupAt: new Date(NOW.getTime() + DAY).toISOString(),
      requiredDeliveryBy: new Date(NOW.getTime() + 4 * DAY).toISOString(),
      serviceLevel: 'STANDARD',
      recipientName: 'Tran Thi Bich',
      recipientPhone: '0909123456',
    },
    NOW,
  );
}

function sampleOrder(overrides: { status?: OrderStatus } = {}): ShipmentOrder {
  return new ShipmentOrder({
    id: 'ord_test',
    reference: 'SFM-2026-000001',
    customerId: 'cus_000001',
    branchId: 'brn_000001',
    cargo: sampleCargo(),
    delivery: sampleDelivery(),
    quotedPrice: Money.of(12_000_000),
    placedAt: NOW,
    ...(overrides.status === undefined ? {} : { status: overrides.status }),
  });
}

function sampleVehicle(type: VehicleType = 'TRUCK_10T'): Vehicle {
  return new Vehicle({ id: 'veh_test', registration: '51C-123.45', type, branchId: 'brn_000001' });
}

function sampleRoute(): Route {
  return new Route({
    id: 'rte_test',
    origin: 'Ho Chi Minh City',
    destination: 'Da Nang',
    legs: [
      RouteLeg.create(
        Waypoint.create('Ho Chi Minh City', 'Ho Chi Minh City depot'),
        Waypoint.create('Nha Trang', 'Nha Trang trunk hub', true),
        430,
        470,
      ),
      RouteLeg.create(
        Waypoint.create('Nha Trang', 'Nha Trang trunk hub', true),
        Waypoint.create('Da Nang', 'Da Nang depot'),
        530,
        580,
      ),
    ],
  });
}

function sampleInvoice(): Invoice {
  return new Invoice({
    id: 'inv_test',
    invoiceNumber: 'INV-2026-000001',
    orderId: 'ord_test',
    customerId: 'cus_000001',
    lines: [InvoiceLine.create('Base handling fee', 1, Money.of(250_000))],
    issuedAt: NOW,
    dueAt: new Date(NOW.getTime() + 14 * DAY),
  });
}

/**
 * Unit tests for the domain layer.
 *
 * Every case here runs against plain domain objects with no repository, no HTTP
 * and no file system, which is only possible because the domain layer has no
 * outward dependencies. That the suite compiles at all is itself evidence for
 * the layering claim in the architecture discussion.
 */
export function registerDomainTests(runner: TestRunner): void {
  // ------------------------------------------------- input validation (C18/C11)

  runner.suite('Input validation (Guard and value objects)', () => {
    runner.test('rejects a blank name with a field-specific message', async () => {
      await Expect.throws(() => Guard.text('fullName', '   '), 'cannot be blank', 'blank text must be refused');
    });

    runner.test('rejects a malformed email address', async () => {
      await Expect.throws(() => ContactInfo.create({ email: 'not-an-email', phone: '0909123456' }), 'valid email', 'bad email refused');
    });

    runner.test('rejects a phone number that is too short', async () => {
      await Expect.throws(() => ContactInfo.create({ email: 'a@b.com', phone: '12' }), 'contact.phone', 'short phone refused');
    });

    runner.test('reports every invalid field at once, not just the first', async () => {
      try {
        ContactInfo.create({ email: 'bad', phone: 'also-bad' });
        throw new Error('expected a validation failure');
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        Expect.isTrue(message.includes('email') && message.includes('phone'), 'both fields reported together');
      }
    });

    runner.test('rejects a city outside the ABC-Trans network', async () => {
      await Expect.throws(
        () => Address.create({ street: '1 Main St', district: 'Central', city: 'Bangkok' }),
        'must be one of',
        'unserviced city refused',
      );
    });

    runner.test('rejects a negative monetary amount', async () => {
      await Expect.throws(() => Money.of(-1), 'cannot be negative', 'negative money refused');
    });

    runner.test('money arithmetic stays exact across many additions', () => {
      const total = Money.sum(new Array(3).fill(Money.of(333_333)));
      Expect.equals(total.amount, 999_999, 'sum of three amounts');
    });

    runner.test('rejects a delivery deadline that precedes pickup', async () => {
      await Expect.throws(
        () =>
          DeliveryDetails.create(
            {
              pickupAddress: { street: '210 Le Van Sy', district: 'Phu Nhuan', city: 'Ho Chi Minh City' },
              deliveryAddress: { street: '15 Ngo Quyen', district: 'Son Tra', city: 'Da Nang' },
              requestedPickupAt: new Date(NOW.getTime() + 4 * DAY).toISOString(),
              requiredDeliveryBy: new Date(NOW.getTime() + DAY).toISOString(),
              serviceLevel: 'STANDARD',
              recipientName: 'Tran Thi Bich',
              recipientPhone: '0909123456',
            },
            NOW,
          ),
        'must be after',
        'reversed dates refused',
      );
    });

    runner.test('rejects a pickup date in the past', async () => {
      await Expect.throws(
        () =>
          DeliveryDetails.create(
            {
              pickupAddress: { street: '210 Le Van Sy', district: 'Phu Nhuan', city: 'Ho Chi Minh City' },
              deliveryAddress: { street: '15 Ngo Quyen', district: 'Son Tra', city: 'Da Nang' },
              requestedPickupAt: new Date(NOW.getTime() - DAY).toISOString(),
              requiredDeliveryBy: new Date(NOW.getTime() + DAY).toISOString(),
              serviceLevel: 'STANDARD',
              recipientName: 'Tran Thi Bich',
              recipientPhone: '0909123456',
            },
            NOW,
          ),
        'cannot be in the past',
        'past pickup refused',
      );
    });

    runner.test('rejects an invalid Vietnamese registration plate', async () => {
      await Expect.throws(
        () => new Vehicle({ id: 'v', registration: 'ABCDEF', type: 'VAN', branchId: 'b' }),
        'not a valid Vietnamese plate',
        'bad plate refused',
      );
    });

    runner.test('accepts a valid plate and normalises it', () => {
      const vehicle = new Vehicle({ id: 'v', registration: ' 51c-123.45 ', type: 'VAN', branchId: 'b' });
      Expect.equals(vehicle.registration, '51C-123.45', 'plate is uppercased and trimmed');
    });
  });

  // ------------------------------------------- vehicle capacity and lifecycle

  runner.suite('Vehicle — capacity and safe deactivation (A1 Task 1)', () => {
    runner.test('a 10-tonne truck can carry a 2-tonne load', () => {
      Expect.isTrue(sampleVehicle('TRUCK_10T').canCarry(sampleCargo(2_000)), 'load fits');
    });

    runner.test('a van cannot carry a 2-tonne load', () => {
      Expect.isFalse(sampleVehicle('VAN').canCarry(sampleCargo(2_000)), 'load exceeds van capacity');
    });

    runner.test('only a refrigerated unit may carry refrigerated freight', () => {
      const chilled = CargoDetails.create({
        description: 'Chilled produce',
        unitCount: 4,
        unitWeightKg: 250,
        totalVolumeM3: 6,
        handling: 'REFRIGERATED',
      });
      Expect.isFalse(sampleVehicle('TRUCK_10T').canCarry(chilled), 'dry truck refused');
      Expect.isTrue(sampleVehicle('REEFER_5T').canCarry(chilled), 'reefer accepted');
    });

    runner.test('a vehicle on an active itinerary cannot be retired (variant 5a)', async () => {
      const vehicle = sampleVehicle();
      vehicle.reserveFor('itn_000001');
      await Expect.throws(() => vehicle.retire(), 'cannot be retired', 'retirement blocked while assigned');
    });

    runner.test('a released vehicle can be retired, and retirement is a soft delete', () => {
      const vehicle = sampleVehicle();
      vehicle.reserveFor('itn_000001');
      vehicle.release(960);
      vehicle.retire();
      Expect.equals(vehicle.status, 'RETIRED', 'status recorded, record preserved');
      Expect.equals(vehicle.odometerKm, 960, 'distance travelled was added to the odometer');
    });

    runner.test('the odometer can never run backwards', async () => {
      const vehicle = new Vehicle({ id: 'v', registration: '51C-123.45', type: 'VAN', branchId: 'b', odometerKm: 5_000 });
      await Expect.throws(() => vehicle.updateDetails({ odometerKm: 100 }), 'cannot decrease', 'odometer guarded');
    });

    runner.test('maintenance is logged and closed on return to service', () => {
      const vehicle = sampleVehicle();
      vehicle.sendToMaintenance('Brake service', NOW);
      Expect.equals(vehicle.status, 'IN_MAINTENANCE', 'status changed');
      Expect.isTrue(vehicle.maintenanceLog[0]?.isOpen() === true, 'record opened');
      vehicle.returnToService(new Date(NOW.getTime() + DAY));
      Expect.equals(vehicle.status, 'AVAILABLE', 'back in service');
      Expect.isFalse(vehicle.maintenanceLog[0]?.isOpen() ?? true, 'record closed');
    });

    runner.test('change C3: a vehicle transfers between branches, so Branch cannot own it', () => {
      const vehicle = sampleVehicle();
      vehicle.transferTo('brn_000002');
      Expect.equals(vehicle.branchId, 'brn_000002', 'branch reassigned');
    });
  });

  // --------------------------------------------------- driver rules (A1 Task 2)

  runner.suite('Driver — qualification, leave and safe deactivation (A1 Task 2)', () => {
    const makeDriver = (licenceClass: 'C' | 'FC' = 'C'): Driver =>
      new Driver({
        id: 'drv_test',
        fullName: 'Le Thi Mai',
        contact: ContactInfo.create({ email: 'mai@abc.example', phone: '0909111222' }),
        branchId: 'brn_000001',
        licenceNumber: 'B0795678',
        licenceClass,
      });

    runner.test('a class C licence does not cover a 20ft container', () => {
      Expect.isFalse(makeDriver('C').qualifiesFor('FC'), 'class C insufficient');
      Expect.isTrue(makeDriver('FC').qualifiesFor('C'), 'class FC covers lower classes');
    });

    runner.test('a driver with an open itinerary cannot be deactivated (variant 3a)', async () => {
      const driver = makeDriver();
      driver.assignToDuty('itn_000001');
      await Expect.throws(() => driver.deactivate(), 'active itinerary', 'deactivation blocked');
    });

    runner.test('a driver on leave is unavailable for an overlapping window', () => {
      const driver = makeDriver();
      driver.goOnLeave(DateRange.create(NOW, new Date(NOW.getTime() + 7 * DAY)));
      Expect.isFalse(
        driver.isAvailableDuring(DateRange.create(new Date(NOW.getTime() + DAY), new Date(NOW.getTime() + 2 * DAY))),
        'overlapping window refused',
      );
      driver.returnFromLeave();
      Expect.equals(driver.availability, 'AVAILABLE', 'available again after leave ends');
    });

    runner.test('an assigned driver cannot be transferred to another branch', async () => {
      const driver = makeDriver();
      driver.assignToDuty('itn_000001');
      await Expect.throws(() => driver.transferTo('brn_000002'), 'cannot be transferred', 'transfer blocked');
    });
  });

  // -------------------------------------------- order lifecycle (C15, A1 Task 6)

  runner.suite('ShipmentOrder — lifecycle transition table (change C15)', () => {
    runner.test('a pending order may be accepted, rejected or cancelled — nothing else', () => {
      Expect.isTrue(OrderLifecycle.canTransition('PENDING', 'ACCEPTED'), 'accept allowed');
      Expect.isTrue(OrderLifecycle.canTransition('PENDING', 'CANCELLED'), 'cancel allowed');
      Expect.isFalse(OrderLifecycle.canTransition('PENDING', 'DELIVERED'), 'delivery not allowed from pending');
    });

    runner.test('a delivered order is terminal', () => {
      Expect.isTrue(OrderLifecycle.isTerminal('DELIVERED'), 'no transitions out of DELIVERED');
      Expect.isTrue(OrderLifecycle.isTerminal('REJECTED'), 'no transitions out of REJECTED');
    });

    runner.test('an order cannot be dispatched before resources are assigned', async () => {
      const order = sampleOrder();
      order.accept('staff.hcm@abctrans.example', NOW);
      await Expect.throws(() => order.dispatch('staff', NOW), 'no vehicle or driver', 'dispatch blocked');
    });

    runner.test('a dispatched order can no longer be cancelled online (A1 Task 6 variant 5a)', async () => {
      const order = sampleOrder();
      order.accept('staff', NOW);
      order.attachItinerary('itn_000001', NOW, 'staff');
      order.dispatch('staff', NOW);
      await Expect.throws(() => order.cancel('Customer', 'changed my mind', NOW), 'no longer be cancelled', 'cancel blocked');
    });

    runner.test('a rejection always records its reason', async () => {
      const order = sampleOrder();
      await Expect.throws(() => order.reject('staff', '', NOW), 'reason', 'blank reason refused');
      order.reject('staff', 'Delivery address could not be verified', NOW);
      Expect.equals(order.status, 'REJECTED', 'status recorded');
      Expect.defined(order.rejectionReason, 'reason retained');
    });

    runner.test('every transition is written to the change history (change C6)', () => {
      const order = sampleOrder();
      order.accept('staff', NOW);
      order.attachItinerary('itn_000001', NOW, 'staff');
      order.dispatch('staff', NOW);
      Expect.isTrue(order.changeHistory.length >= 3, 'accept, assign and dispatch all recorded');
      Expect.equals(order.changeHistory[0]?.toStatus, 'ACCEPTED', 'first entry is the acceptance');
    });

    runner.test('amendment is refused once the order is dispatched', async () => {
      const order = sampleOrder();
      order.accept('staff', NOW);
      order.attachItinerary('itn_000001', NOW, 'staff');
      order.dispatch('staff', NOW);
      await Expect.throws(
        () => order.amendDelivery({ recipientName: 'Someone Else' }, 'Customer', NOW),
        'no longer be changed',
        'amendment blocked',
      );
    });

    runner.test('amendment succeeds while pending and is recorded', () => {
      const order = sampleOrder();
      order.amendDelivery({ recipientName: 'Nguyen Van Long' }, 'Customer', NOW);
      Expect.equals(order.delivery.recipientName, 'Nguyen Van Long', 'new recipient stored');
      Expect.isTrue(
        order.changeHistory.some((entry) => entry.summary.includes('amended')),
        'amendment recorded in history',
      );
    });

    runner.test('a customer cannot read another customer’s order (A1 Task 8 variant 1a)', async () => {
      const order = sampleOrder();
      await Expect.throws(() => order.assertOwnedBy('cus_999999'), 'No matching shipment', 'ownership enforced');
    });
  });

  // ---------------------------------------------------- tracking (A1 Task 8)

  runner.suite('Tracking — immutable, ordered history (A1 Task 8)', () => {
    const dispatchedOrder = (): ShipmentOrder => {
      const order = sampleOrder();
      order.accept('staff', NOW);
      order.attachItinerary('itn_000001', NOW, 'staff');
      order.dispatch('staff', NOW);
      return order;
    };

    const update = (state: 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED', at: Date, itineraryId = 'itn_000001'): TrackingUpdate =>
      TrackingUpdate.create({
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
        () => order.appendTracking(update('PICKED_UP', NOW, 'itn_other')),
        'Only a driver on an itinerary',
        'unassigned itinerary refused',
      );
    });

    runner.test('a checkpoint cannot pre-date the previous one', async () => {
      const order = dispatchedOrder();
      order.appendTracking(update('PICKED_UP', new Date(NOW.getTime() + 2 * 60 * 60 * 1000)));
      await Expect.throws(
        () => order.appendTracking(update('IN_TRANSIT', NOW)),
        'cannot be dated before',
        'chronological order enforced',
      );
    });

    runner.test('a pickup checkpoint advances the order to IN_TRANSIT', () => {
      const order = dispatchedOrder();
      order.appendTracking(update('PICKED_UP', NOW));
      Expect.equals(order.status, 'IN_TRANSIT', 'lifecycle advanced by the checkpoint');
    });

    runner.test('a delivered checkpoint completes the order and records on-time delivery', () => {
      const order = dispatchedOrder();
      order.appendTracking(update('PICKED_UP', NOW));
      order.appendTracking(update('DELIVERED', new Date(NOW.getTime() + 2 * DAY)));
      Expect.equals(order.status, 'DELIVERED', 'order delivered');
      Expect.equals(order.wasDeliveredOnTime(), true, 'delivered before the deadline');
    });

    runner.test('tracking updates are frozen after creation', () => {
      const created = update('PICKED_UP', NOW);
      Expect.isTrue(Object.isFrozen(created), 'TrackingUpdate instances are immutable');
    });

    runner.test('no tracking is accepted for an order that is not under way', async () => {
      // The itinerary is attached, so the ownership check passes and it is the
      // lifecycle rule alone that refuses the update.
      const order = sampleOrder();
      order.attachItinerary('itn_000001', NOW, 'staff');
      await Expect.throws(
        () => order.appendTracking(update('PICKED_UP', NOW)),
        'only accepted for a shipment that is under way',
        'pending order refuses tracking',
      );
    });
  });

  // ------------------------------------------------- billing (C16, A1 Task 9)

  runner.suite('Billing — invoice, strategy, receipt (A1 Task 9)', () => {
    runner.test('the invoice total is derived from its line items', () => {
      const invoice = new Invoice({
        id: 'inv',
        invoiceNumber: 'INV-2026-000001',
        orderId: 'ord',
        customerId: 'cus',
        lines: [
          InvoiceLine.create('Base handling fee', 1, Money.of(250_000)),
          InvoiceLine.create('Line haul', 960, Money.of(11_000)),
        ],
        issuedAt: NOW,
        dueAt: new Date(NOW.getTime() + 14 * DAY),
      });
      Expect.equals(invoice.total().amount, 250_000 + 960 * 11_000, 'total matches the itemisation');
    });

    runner.test('an invoice with no line items is refused', async () => {
      await Expect.throws(
        () =>
          new Invoice({
            id: 'inv',
            invoiceNumber: 'INV-1',
            orderId: 'ord',
            customerId: 'cus',
            lines: [],
            issuedAt: NOW,
            dueAt: NOW,
          }),
        'at least one line item',
        'empty invoice refused',
      );
    });

    runner.test('a card ending 0000 is declined and leaves the invoice outstanding', () => {
      const invoice = sampleInvoice();
      const payment = new Payment({
        id: 'pay_1',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: CardPayment.create(
          { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '0000', expiryMonth: 12, expiryYear: 2030 },
          NOW,
        ),
        attemptedAt: NOW,
      });
      const result = payment.attempt(invoice);
      Expect.isFalse(result.isSuccess(), 'declined');
      Expect.isTrue(result.retryable, 'customer may retry');
      Expect.equals(invoice.status, 'OUTSTANDING', 'invoice unchanged');
      Expect.equals(invoice.paymentAttemptIds.length, 1, 'the failed attempt is still on record');
    });

    runner.test('a card ending 9999 reports a gateway timeout', () => {
      const invoice = sampleInvoice();
      const payment = new Payment({
        id: 'pay_2',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: CardPayment.create(
          { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '9999', expiryMonth: 12, expiryYear: 2030 },
          NOW,
        ),
        attemptedAt: NOW,
      });
      Expect.equals(payment.attempt(invoice).outcome, 'GATEWAY_TIMEOUT', 'timeout reported distinctly');
    });

    runner.test('an expired card is refused before any attempt is made', async () => {
      await Expect.throws(
        () =>
          CardPayment.create(
            { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '1234', expiryMonth: 1, expiryYear: 2026 },
            new Date('2026-08-05T08:00:00.000Z'),
          ),
        'expired',
        'expired card refused',
      );
    });

    runner.test('short cash is refused with the shortfall explained', () => {
      const invoice = sampleInvoice();
      const payment = new Payment({
        id: 'pay_3',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: CashPayment.create({ branchId: 'brn_000001', cashierName: 'Le Van Minh', amountTendered: 1_000 }),
        attemptedAt: NOW,
      });
      const result = payment.attempt(invoice);
      Expect.equals(result.outcome, 'INSUFFICIENT_AMOUNT', 'shortfall detected');
      Expect.isTrue(invoice.isOutstanding(), 'invoice still outstanding');
    });

    runner.test('a confirmed payment settles the invoice and produces a receipt', () => {
      const invoice = sampleInvoice();
      const payment = new Payment({
        id: 'pay_4',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: CashPayment.create({ branchId: 'brn_000001', cashierName: 'Le Van Minh', amountTendered: 500_000 }),
        attemptedAt: NOW,
      });
      Expect.isTrue(payment.attempt(invoice).isSuccess(), 'confirmed');
      Expect.equals(invoice.status, 'SETTLED', 'invoice settled');

      const receipt = payment.issueReceipt('rcp_1', 'RCP-2026-000001', NOW);
      Expect.equals(receipt.amount.amount, invoice.total().amount, 'receipt carries the settled amount');
      Expect.isTrue(Object.isFrozen(receipt), 'receipts are immutable');
    });

    runner.test('a settled invoice refuses a second payment (A1 Task 9 critical case)', async () => {
      const invoice = sampleInvoice();
      const first = new Payment({
        id: 'pay_5',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: CashPayment.create({ branchId: 'brn_000001', cashierName: 'Le Van Minh', amountTendered: 500_000 }),
        attemptedAt: NOW,
      });
      first.attempt(invoice);

      const second = new Payment({
        id: 'pay_6',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: CashPayment.create({ branchId: 'brn_000001', cashierName: 'Le Van Minh', amountTendered: 500_000 }),
        attemptedAt: NOW,
      });
      await Expect.throws(() => second.attempt(invoice), 'already been paid', 'double settlement refused');
    });

    runner.test('a receipt cannot be issued for a failed payment', async () => {
      const invoice = sampleInvoice();
      const payment = new Payment({
        id: 'pay_7',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: invoice.total(),
        method: CardPayment.create(
          { cardHolder: 'NGUYEN THI HOA', lastFourDigits: '0000', expiryMonth: 12, expiryYear: 2030 },
          NOW,
        ),
        attemptedAt: NOW,
      });
      payment.attempt(invoice);
      await Expect.throws(
        () => payment.issueReceipt('rcp', 'RCP-1', NOW),
        'only be issued for a confirmed payment',
        'no receipt without settlement',
      );
    });

    runner.test('a payment whose amount does not match the invoice is refused', async () => {
      const invoice = sampleInvoice();
      const payment = new Payment({
        id: 'pay_8',
        invoiceId: invoice.id,
        orderId: 'ord_test',
        customerId: 'cus_000001',
        amount: Money.of(1),
        method: CashPayment.create({ branchId: 'brn_000001', cashierName: 'Le Van Minh', amountTendered: 1 }),
        attemptedAt: NOW,
      });
      await Expect.throws(() => payment.attempt(invoice), 'does not match the invoice total', 'amount checked');
    });
  });

  // --------------------------------------- routes and itineraries (C4, C5, C6)

  runner.suite('Route and Itinerary — reusable lanes, no double-booking (C4/C5/C6)', () => {
    runner.test('a route derives its distance and duration from its legs', () => {
      const route = sampleRoute();
      Expect.equals(route.totalDistanceKm(), 960, 'distance is the sum of legs');
      Expect.equals(route.waypoints().length, 3, 'origin, hub and destination');
    });

    runner.test('a route with no legs is refused', async () => {
      await Expect.throws(
        () => new Route({ id: 'r', origin: 'Ha Noi', destination: 'Da Nang', legs: [] }),
        'at least one leg',
        'empty route refused',
      );
    });

    runner.test('a route knows which lane it serves, so it can be reused', () => {
      Expect.isTrue(sampleRoute().serves('Ho Chi Minh City', 'Da Nang'), 'lane matched');
      Expect.isFalse(sampleRoute().serves('Ha Noi', 'Da Nang'), 'other lane not matched');
    });

    const makeItinerary = (id: string, vehicleId: string, driverId: string, offsetDays: number): Itinerary =>
      new Itinerary({
        id,
        orderId: 'ord_test',
        branchId: 'brn_000001',
        vehicleId,
        driverId,
        routeId: 'rte_test',
        legNumber: 1,
        assignedWeightKg: 2_000,
        window: DateRange.create(
          new Date(NOW.getTime() + offsetDays * DAY),
          new Date(NOW.getTime() + (offsetDays + 2) * DAY),
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
      first.complete(new Date(NOW.getTime() + 3 * DAY));
      Expect.isFalse(first.conflictsWith(second), 'completed itinerary releases its resources');
    });

    runner.test('change C5: a completed itinerary still records the hours it consumed', () => {
      const itinerary = makeItinerary('itn_1', 'veh_1', 'drv_1', 1);
      itinerary.complete(new Date(NOW.getTime() + 3 * DAY));
      Expect.equals(itinerary.committedHours(), 48, 'two days of committed resource time survive the order');
    });
  });

  // -------------------------------------------------- capacity holds (C14)

  runner.suite('CapacityHold — the reservation Assignment 2 never named (C14)', () => {
    runner.test('a fresh hold blocks other customers', () => {
      const hold = new CapacityHold({ id: 'hld_1', vehicleId: 'veh_1', customerId: 'cus_1', heldFrom: NOW });
      Expect.isTrue(hold.isActive(NOW), 'active immediately');
      Expect.equals(hold.minutesRemaining(NOW), 15, 'fifteen-minute window');
    });

    runner.test('a hold expires on its own after fifteen minutes', async () => {
      const hold = new CapacityHold({ id: 'hld_1', vehicleId: 'veh_1', customerId: 'cus_1', heldFrom: NOW });
      const later = new Date(NOW.getTime() + 16 * 60_000);
      Expect.isFalse(hold.isActive(later), 'expired');
      await Expect.throws(() => hold.assertStillValid(later), 'expired', 'expiry explained to the customer');
    });

    runner.test('a released hold returns capacity immediately (change of mind)', async () => {
      const hold = new CapacityHold({ id: 'hld_1', vehicleId: 'veh_1', customerId: 'cus_1', heldFrom: NOW });
      hold.release();
      await Expect.throws(() => hold.assertStillValid(NOW), 'released', 'released hold refused');
    });
  });

  // ---------------------------------------------------- account rules (Task 3)

  runner.suite('Customer — account lifecycle (A1 Task 3)', () => {
    const makeCustomer = (): Customer =>
      new Customer({
        id: 'cus_test',
        fullName: 'Nguyen Thi Hoa',
        contact: ContactInfo.create({ email: 'hoa@example.com', phone: '0987111222' }),
        billingAddress: hcmAddress(),
        accountStatus: 'ACTIVE',
        registeredAt: NOW,
      });

    runner.test('an unverified account cannot transact', async () => {
      const customer = new Customer({
        id: 'cus_test',
        fullName: 'Nguyen Thi Hoa',
        contact: ContactInfo.create({ email: 'hoa@example.com', phone: '0987111222' }),
        billingAddress: hcmAddress(),
        registeredAt: NOW,
      });
      await Expect.throws(() => customer.assertUsable(), 'awaiting verification', 'pending account blocked');
      customer.verifyContactDetails();
      customer.assertUsable();
    });

    runner.test('closure is refused while orders are open (variant 5a)', async () => {
      await Expect.throws(() => makeCustomer().requestClosure(2, 0), 'still active', 'open orders block closure');
    });

    runner.test('closure is refused while invoices are unpaid', async () => {
      await Expect.throws(() => makeCustomer().requestClosure(0, 1), 'remain unpaid', 'unpaid invoices block closure');
    });

    runner.test('a clean account closes and is deactivated, not deleted', () => {
      const customer = makeCustomer();
      customer.requestClosure(0, 0);
      Expect.equals(customer.accountStatus, 'CLOSED', 'status recorded');
      Expect.isFalse(customer.isActive, 'deactivated');
      Expect.equals(customer.fullName, 'Nguyen Thi Hoa', 'history preserved');
    });
  });

  // ------------------------------------------------- branch rules (change C3)

  runner.suite('Branch — aggregation, not composition (change C3)', () => {
    const makeBranch = (): Branch =>
      new Branch({
        id: 'brn_000001',
        name: 'ABC-Trans Ho Chi Minh Central',
        code: 'HCM',
        address: hcmAddress(),
        contact: ContactInfo.create({ email: 'hcm@abc.example', phone: '02838001100' }),
      });

    runner.test('a branch refuses to process another branch’s order', async () => {
      await Expect.throws(
        () => makeBranch().assertMayProcess({ branchId: 'brn_000002', reference: 'SFM-2026-000009' }),
        'belongs to another branch',
        'queue isolation enforced',
      );
    });

    runner.test('a branch cannot close while it still holds resources', async () => {
      await Expect.throws(() => makeBranch().close(3, 2, 0), 'Transfer 3 vehicle', 'resources must move first');
    });

    runner.test('a branch closes once its resources have been transferred away', () => {
      const branch = makeBranch();
      branch.close(0, 0, 0);
      Expect.isFalse(branch.isOperational(), 'closed');
    });
  });

  // ----------------------------------------------------- reporting (change C2)

  runner.suite('Reporting — two focused reports replace one generic Report (C2)', () => {
    runner.test('an empty period returns a no-data result, not an error (variant 1b)', () => {
      const report = ShipmentStatisticsReport.compile({
        period: ReportPeriod.month(NOW),
        scopeLabel: 'All branches',
        orders: [],
        invoices: [],
        generatedAt: NOW,
      });
      Expect.isTrue(report.isEmpty(), 'empty period detected');
      Expect.isTrue(report.headline().includes('No shipment activity'), 'a readable message, not a crash');
    });

    runner.test('statistics count orders by status and measure on-time delivery', () => {
      const delivered = sampleOrder();
      delivered.accept('staff', NOW);
      delivered.attachItinerary('itn_000001', NOW, 'staff');
      delivered.dispatch('staff', NOW);
      delivered.appendTracking(
        TrackingUpdate.create({
          id: 'trk_1',
          orderId: delivered.id,
          itineraryId: 'itn_000001',
          recordedByDriverId: 'drv_000001',
          recordedAt: new Date(NOW.getTime() + 2 * DAY),
          state: 'DELIVERED',
          locationLabel: 'Da Nang',
        }),
      );
      const pending = sampleOrder();

      const report = ShipmentStatisticsReport.compile({
        period: ReportPeriod.month(NOW),
        scopeLabel: 'All branches',
        orders: [delivered, pending],
        invoices: [],
        generatedAt: NOW,
      });
      Expect.equals(report.totalOrders, 2, 'two orders counted');
      Expect.equals(report.deliveredCount, 1, 'one delivered');
      Expect.equals(report.onTimeDeliveryRate(), 100, 'delivered inside the window');
      Expect.equals(report.busiestLanes[0]?.orderCount, 2, 'both orders on the same lane');
    });

    runner.test('a report period resolves the presets Assignment 1 Task 10 named', () => {
      Expect.equals(ReportPeriod.resolve('DAY', NOW).preset, 'DAY', 'day preset');
      Expect.equals(ReportPeriod.resolve('YEAR_TO_DATE', NOW).preset, 'YEAR_TO_DATE', 'year-to-date preset');
      Expect.isTrue(ReportPeriod.week(NOW).range.durationDays() === 7, 'week spans seven days');
    });

    runner.test('reports are read-only: the compiled object is frozen', () => {
      const report = ShipmentStatisticsReport.compile({
        period: ReportPeriod.month(NOW),
        scopeLabel: 'All branches',
        orders: [],
        invoices: [],
        generatedAt: NOW,
      });
      Expect.isTrue(Object.isFrozen(report), 'no caller can mutate a report');
    });
  });
}
