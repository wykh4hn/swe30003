import { Expect } from './TestRunner.ts';
import type { TestRunner } from './TestRunner.ts';
import * as D from './DomainTestFixtures.ts';
import * as S from './ScenarioTestFixtures.ts';

/** Executable tests grouped by SmartFM business area. */
export function registerVehicleDomainTests(runner: TestRunner): void {
  runner.suite('Vehicle — capacity and safe deactivation (A1 Task 1)', () => {
    runner.test('a 10-tonne truck can carry a 2-tonne load', () => {
      Expect.isTrue(D.sampleVehicle('TRUCK_10T').canCarry(D.sampleCargo(2_000)), 'load fits');
    });

    runner.test('a van cannot carry a 2-tonne load', () => {
      Expect.isFalse(D.sampleVehicle('VAN').canCarry(D.sampleCargo(2_000)), 'load exceeds van capacity');
    });

    runner.test('only a refrigerated unit may carry refrigerated freight', () => {
      const chilled = D.CargoDetails.create({
        description: 'Chilled produce',
        unitCount: 4,
        unitWeightKg: 250,
        totalVolumeM3: 6,
        handling: 'REFRIGERATED',
      });
      Expect.isFalse(D.sampleVehicle('TRUCK_10T').canCarry(chilled), 'dry truck refused');
      Expect.isTrue(D.sampleVehicle('REEFER_5T').canCarry(chilled), 'reefer accepted');
    });

    runner.test('a vehicle on an active itinerary cannot be retired (variant 5a)', async () => {
      const vehicle = D.sampleVehicle();
      vehicle.reserveFor('itn_000001');
      await Expect.throws(() => vehicle.retire(), 'cannot be retired', 'retirement blocked while assigned');
    });

    runner.test('a released vehicle can be retired, and retirement is a soft delete', () => {
      const vehicle = D.sampleVehicle();
      vehicle.reserveFor('itn_000001');
      vehicle.release(960);
      vehicle.retire();
      Expect.equals(vehicle.status, 'RETIRED', 'status recorded, record preserved');
      Expect.equals(vehicle.odometerKm, 960, 'distance travelled was added to the odometer');
    });

    runner.test('the odometer can never run backwards', async () => {
      const vehicle = new D.Vehicle({ id: 'v', registration: '51C-123.45', type: 'VAN', branchId: 'b', odometerKm: 5_000 });
      await Expect.throws(() => vehicle.updateDetails({ odometerKm: 100 }), 'cannot decrease', 'odometer guarded');
    });

    runner.test('maintenance is logged and closed on return to service', () => {
      const vehicle = D.sampleVehicle();
      vehicle.sendToMaintenance('Brake service', D.NOW);
      Expect.equals(vehicle.status, 'IN_MAINTENANCE', 'status changed');
      Expect.isTrue(vehicle.maintenanceLog[0]?.isOpen() === true, 'record opened');
      vehicle.returnToService(new Date(D.NOW.getTime() + D.DAY));
      Expect.equals(vehicle.status, 'AVAILABLE', 'back in service');
      Expect.isFalse(vehicle.maintenanceLog[0]?.isOpen() ?? true, 'record closed');
    });

    runner.test('change C3: a vehicle transfers between branches, so Branch cannot own it', () => {
      const vehicle = D.sampleVehicle();
      vehicle.transferTo('brn_000002');
      Expect.equals(vehicle.branchId, 'brn_000002', 'branch reassigned');
    });
  });

}

export function registerDriverDomainTests(runner: TestRunner): void {
  runner.suite('Driver — qualification, leave and safe deactivation (A1 Task 2)', () => {
    const makeDriver = (licenceClass: 'C' | 'FC' = 'C'): D.Driver =>
      new D.Driver({
        id: 'drv_test',
        fullName: 'Le Thi Mai',
        contact: D.ContactInfo.create({ email: 'mai@abc.example', phone: '0909111222' }),
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
      driver.goOnLeave(D.DateRange.create(D.NOW, new Date(D.NOW.getTime() + 7 * D.DAY)));
      Expect.isFalse(
        driver.isAvailableDuring(D.DateRange.create(new Date(D.NOW.getTime() + D.DAY), new Date(D.NOW.getTime() + 2 * D.DAY))),
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

}

export function registerBranchDomainTests(runner: TestRunner): void {
  runner.suite('Branch — aggregation, not composition (change C3)', () => {
    const makeBranch = (): D.Branch =>
      new D.Branch({
        id: 'brn_000001',
        name: 'ABC-Trans Ho Chi Minh Central',
        code: 'HCM',
        address: D.hcmAddress(),
        contact: D.ContactInfo.create({ email: 'hcm@abc.example', phone: '02838001100' }),
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

}

export function registerFleetScenarioTests(runner: TestRunner): void {
  runner.suite('Scenario 5 — Fleet and driver management (A1 Tasks 1 and 2)', () => {
    runner.test('a vehicle is registered, and a duplicate plate is refused', async () => {
      const { app, dispose } = await S.freshApplication();
      try {
        const vehicle = await app.services.fleet.registerVehicle({
          registration: '51C-999.11',
          type: 'TRUCK_5T',
          branchId: S.HCM_BRANCH,
          odometerKm: 1_000,
        });
        Expect.equals(vehicle.registration, '51C-999.11', 'registered');

        await Expect.throws(
          () =>
            app.services.fleet.registerVehicle({
              registration: '51c-999.11',
              type: 'VAN',
              branchId: S.HCM_BRANCH,
            }),
          'already on file',
          'duplicate plate refused regardless of case',
        );
      } finally {
        await dispose();
      }
    });

    runner.test('a vehicle on an active itinerary cannot be retired', async () => {
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { itineraryId } = await S.dispatchOrder(app, orderId);
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
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const { orderId } = await S.placeOrder(app, clock);
        const { driverId } = await S.dispatchOrder(app, orderId);

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
      const { app, clock, dispose } = await S.freshApplication();
      try {
        const before = await app.services.orders.searchAvailability({
          cargo: S.cargo(),
          delivery: S.delivery(clock),
          preferredBranchId: S.HCM_BRANCH,
        });
        const vehicleId = Expect.defined(before.options[0]?.vehicles[0]?.id, 'a vehicle');

        await app.services.fleet.sendVehicleToMaintenance(vehicleId, 'Scheduled brake service');

        const after = await app.services.orders.searchAvailability({
          cargo: S.cargo(),
          delivery: S.delivery(clock),
          preferredBranchId: S.HCM_BRANCH,
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

}
