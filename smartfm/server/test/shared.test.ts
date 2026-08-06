import { Expect } from './TestRunner.ts';
import type { TestRunner } from './TestRunner.ts';
import * as D from './DomainTestFixtures.ts';

/** Executable tests grouped by SmartFM business area. */
export function registerSharedDomainTests(runner: TestRunner): void {

  runner.suite('Input validation (Guard and value objects)', () => {
    runner.test('rejects a blank name with a field-specific message', async () => {
      await Expect.throws(() => D.Guard.text('fullName', '   '), 'cannot be blank', 'blank text must be refused');
    });

    runner.test('rejects a malformed email address', async () => {
      await Expect.throws(() => D.ContactInfo.create({ email: 'not-an-email', phone: '0909123456' }), 'valid email', 'bad email refused');
    });

    runner.test('rejects a phone number that is too short', async () => {
      await Expect.throws(() => D.ContactInfo.create({ email: 'a@b.com', phone: '12' }), 'contact.phone', 'short phone refused');
    });

    runner.test('reports every invalid field at once, not just the first', async () => {
      try {
        D.ContactInfo.create({ email: 'bad', phone: 'also-bad' });
        throw new Error('expected a validation failure');
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        Expect.isTrue(message.includes('email') && message.includes('phone'), 'both fields reported together');
      }
    });

    runner.test('rejects a city outside the ABC-Trans network', async () => {
      await Expect.throws(
        () => D.Address.create({ street: '1 Main St', district: 'Central', city: 'Bangkok' }),
        'must be one of',
        'unserviced city refused',
      );
    });

    runner.test('rejects a negative monetary amount', async () => {
      await Expect.throws(() => D.Money.of(-1), 'cannot be negative', 'negative money refused');
    });

    runner.test('money arithmetic stays exact across many additions', () => {
      const total = D.Money.sum(new Array(3).fill(D.Money.of(333_333)));
      Expect.equals(total.amount, 999_999, 'sum of three amounts');
    });

    runner.test('rejects a delivery deadline that precedes pickup', async () => {
      await Expect.throws(
        () =>
          D.DeliveryDetails.create(
            {
              pickupAddress: { street: '210 Le Van Sy', district: 'Phu Nhuan', city: 'Ho Chi Minh City' },
              deliveryAddress: { street: '15 Ngo Quyen', district: 'Son Tra', city: 'Da Nang' },
              requestedPickupAt: new Date(D.NOW.getTime() + 4 * D.DAY).toISOString(),
              requiredDeliveryBy: new Date(D.NOW.getTime() + D.DAY).toISOString(),
              serviceLevel: 'STANDARD',
              recipientName: 'Tran Thi Bich',
              recipientPhone: '0909123456',
            },
            D.NOW,
          ),
        'must be after',
        'reversed dates refused',
      );
    });

    runner.test('rejects a pickup date in the past', async () => {
      await Expect.throws(
        () =>
          D.DeliveryDetails.create(
            {
              pickupAddress: { street: '210 Le Van Sy', district: 'Phu Nhuan', city: 'Ho Chi Minh City' },
              deliveryAddress: { street: '15 Ngo Quyen', district: 'Son Tra', city: 'Da Nang' },
              requestedPickupAt: new Date(D.NOW.getTime() - D.DAY).toISOString(),
              requiredDeliveryBy: new Date(D.NOW.getTime() + D.DAY).toISOString(),
              serviceLevel: 'STANDARD',
              recipientName: 'Tran Thi Bich',
              recipientPhone: '0909123456',
            },
            D.NOW,
          ),
        'cannot be in the past',
        'past pickup refused',
      );
    });

    runner.test('rejects an invalid Vietnamese registration plate', async () => {
      await Expect.throws(
        () => new D.Vehicle({ id: 'v', registration: 'ABCDEF', type: 'VAN', branchId: 'b' }),
        'not a valid Vietnamese plate',
        'bad plate refused',
      );
    });

    runner.test('accepts a valid plate and normalises it', () => {
      const vehicle = new D.Vehicle({ id: 'v', registration: ' 51c-123.45 ', type: 'VAN', branchId: 'b' });
      Expect.equals(vehicle.registration, '51C-123.45', 'plate is uppercased and trimmed');
    });
  });

}
