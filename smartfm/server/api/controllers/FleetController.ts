import { ApiController } from './ApiController.ts';
import type { Router } from '../Router.ts';
import type { Services } from '../../infrastructure/ApplicationContext.ts';
import { Presenter } from '../Presenter.ts';

/** Business area 2 — Fleet and Driver Resource Management (Assignment 1 Tasks 1 and 2). */
export class FleetController extends ApiController {
  constructor(services: Services) {
    super(services);
  }

  override register(router: Router): void {
    router.get('/api/branches', async () =>
      (await this.services.fleet.listBranches()).map((branch) => Presenter.branch(branch)),
    );

    // -------------------------------------------------------------- vehicles

    router.get('/api/vehicles', async (context) => {
      const session = this.requireSession(context, 'BRANCH_STAFF');
      const branchId = this.query(context, 'branchId') ?? session.branchId;
      return (await this.services.fleet.listVehicles(branchId)).map((vehicle) => Presenter.vehicle(vehicle));
    });

    router.post('/api/vehicles', async (context) => {
      const session = this.requireBranchSession(context);
      const vehicle = await this.services.fleet.registerVehicle({
        registration: context.body['registration'],
        type: context.body['type'],
        branchId: context.body['branchId'] ?? session.branchId,
        odometerKm: context.body['odometerKm'],
      });
      return Presenter.vehicle(vehicle);
    });

    router.patch('/api/vehicles/:vehicleId', async (context) => {
      this.requireBranchSession(context);
      const vehicle = await this.services.fleet.updateVehicle(this.param(context, 'vehicleId'), {
        registration: context.body['registration'],
        type: context.body['type'],
        odometerKm: context.body['odometerKm'],
      });
      return Presenter.vehicle(vehicle);
    });

    router.post('/api/vehicles/:vehicleId/maintenance', async (context) => {
      this.requireBranchSession(context);
      const vehicle = await this.services.fleet.sendVehicleToMaintenance(
        this.param(context, 'vehicleId'),
        context.body['description'],
        context.body['expectedReturn'],
      );
      return Presenter.vehicle(vehicle);
    });

    router.post('/api/vehicles/:vehicleId/return-to-service', async (context) => {
      this.requireBranchSession(context);
      return Presenter.vehicle(await this.services.fleet.returnVehicleToService(this.param(context, 'vehicleId')));
    });

    router.post('/api/vehicles/:vehicleId/transfer', async (context) => {
      this.requireBranchSession(context);
      const vehicle = await this.services.fleet.transferVehicle(
        this.param(context, 'vehicleId'),
        String(context.body['branchId'] ?? ''),
      );
      return Presenter.vehicle(vehicle);
    });

    // Assignment 1 Task 1 variant 5a: soft delete, refused while assigned.
    router.post('/api/vehicles/:vehicleId/retire', async (context) => {
      this.requireBranchSession(context);
      return Presenter.vehicle(await this.services.fleet.retireVehicle(this.param(context, 'vehicleId')));
    });

    router.post('/api/vehicles/:vehicleId/reinstate', async (context) => {
      this.requireBranchSession(context);
      return Presenter.vehicle(await this.services.fleet.reinstateVehicle(this.param(context, 'vehicleId')));
    });

    // --------------------------------------------------------------- drivers

    router.get('/api/drivers', async (context) => {
      const session = this.requireSession(context, 'BRANCH_STAFF');
      const branchId = this.query(context, 'branchId') ?? session.branchId;
      return (await this.services.fleet.listDrivers(branchId)).map((driver) => Presenter.driver(driver));
    });

    router.post('/api/drivers', async (context) => {
      const session = this.requireBranchSession(context);
      const driver = await this.services.fleet.registerDriver({
        fullName: context.body['fullName'],
        email: context.body['email'],
        phone: context.body['phone'],
        branchId: context.body['branchId'] ?? session.branchId,
        licenceNumber: context.body['licenceNumber'],
        licenceClass: context.body['licenceClass'],
        password: context.body['password'],
      });
      return Presenter.driver(driver);
    });

    router.patch('/api/drivers/:driverId', async (context) => {
      this.requireBranchSession(context);
      const driver = await this.services.fleet.updateDriver(this.param(context, 'driverId'), {
        fullName: context.body['fullName'],
        email: context.body['email'],
        phone: context.body['phone'],
        licenceNumber: context.body['licenceNumber'],
        licenceClass: context.body['licenceClass'],
      });
      return Presenter.driver(driver);
    });

    router.post('/api/drivers/:driverId/leave', async (context) => {
      this.requireBranchSession(context);
      const driver = await this.services.fleet.recordDriverLeave(
        this.param(context, 'driverId'),
        context.body['start'],
        context.body['end'],
      );
      return Presenter.driver(driver);
    });

    router.post('/api/drivers/:driverId/end-leave', async (context) => {
      this.requireBranchSession(context);
      return Presenter.driver(await this.services.fleet.endDriverLeave(this.param(context, 'driverId')));
    });

    router.post('/api/drivers/:driverId/transfer', async (context) => {
      this.requireBranchSession(context);
      const driver = await this.services.fleet.transferDriver(
        this.param(context, 'driverId'),
        String(context.body['branchId'] ?? ''),
      );
      return Presenter.driver(driver);
    });

    // Assignment 1 Task 2 variant 3a: refused while an itinerary is open.
    router.post('/api/drivers/:driverId/deactivate', async (context) => {
      this.requireBranchSession(context);
      return Presenter.driver(await this.services.fleet.deactivateDriver(this.param(context, 'driverId')));
    });

    router.post('/api/drivers/:driverId/reactivate', async (context) => {
      this.requireBranchSession(context);
      return Presenter.driver(await this.services.fleet.reactivateDriver(this.param(context, 'driverId')));
    });
  }
}
