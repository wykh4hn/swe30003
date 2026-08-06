import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Expect } from './TestRunner.ts';
import { ApplicationContext } from '../infrastructure/ApplicationContext.ts';
import { FixedClock } from '../infrastructure/Clock.ts';
import type { AvailabilityOption } from '../application/OrderService.ts';

export const START = new Date('2026-08-05T08:00:00.000Z');
export const DAY = 24 * 60 * 60 * 1000;

export const CUSTOMER_ONE = 'cus_000001';
export const CUSTOMER_TWO = 'cus_000002';
export const HCM_BRANCH = 'brn_000001';

/** Builds a throwaway application on a temporary data directory. */
export async function freshApplication(): Promise<{ app: ApplicationContext; clock: FixedClock; dispose: () => Promise<void> }> {
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

export function cargo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

export function delivery(clock: FixedClock, overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
export async function placeOrder(
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
export async function dispatchOrder(
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

export { ApplicationContext, FixedClock };
export type { AvailabilityOption };
