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

export const NOW = new Date('2026-08-05T08:00:00.000Z');
export const DAY = 24 * 60 * 60 * 1000;

export function hcmAddress(): Address {
  return Address.create({ street: '210 Le Van Sy', district: 'Phu Nhuan', city: 'Ho Chi Minh City' });
}

export function sampleCargo(weightKg = 2_000): CargoDetails {
  return CargoDetails.create({
    description: 'Packaged retail goods',
    unitCount: 10,
    unitWeightKg: weightKg / 10,
    totalVolumeM3: 12,
    handling: 'STANDARD',
    declaredValue: 50_000_000,
  });
}

export function sampleDelivery(): DeliveryDetails {
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

export function sampleOrder(overrides: { status?: OrderStatus } = {}): ShipmentOrder {
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

export function sampleVehicle(type: VehicleType = 'TRUCK_10T'): Vehicle {
  return new Vehicle({ id: 'veh_test', registration: '51C-123.45', type, branchId: 'brn_000001' });
}

export function sampleRoute(): Route {
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

export function sampleInvoice(): Invoice {
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

export {
  Money, Address, ContactInfo, DateRange, Guard, Customer, Driver, Vehicle, Branch, CargoDetails,
  DeliveryDetails, ShipmentOrder, OrderLifecycle, CapacityHold, Itinerary, Route, RouteLeg, Waypoint,
  Invoice, InvoiceLine, Payment, CashPayment, CardPayment, TrackingUpdate, ReportPeriod,
  ShipmentStatisticsReport,
};
export type { VehicleType, OrderStatus };
