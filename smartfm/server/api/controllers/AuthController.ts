import { ApiController } from './ApiController.ts';
import type { Router } from '../Router.ts';
import type { Services } from '../../infrastructure/ApplicationContext.ts';
import { Presenter } from '../Presenter.ts';
import { DEMO_PASSWORD, SeedData } from '../../infrastructure/SeedData.ts';
import { SERVICED_CITIES } from '../../domain/shared/Address.ts';
import { VEHICLE_TYPES } from '../../domain/fleet/Vehicle.ts';
import { LICENCE_CLASSES } from '../../domain/people/Driver.ts';
import { HANDLING_CLASSES } from '../../domain/ordering/CargoDetails.ts';
import { SERVICE_LEVELS } from '../../domain/ordering/DeliveryDetails.ts';
import { TRACKING_STATES } from '../../domain/tracking/TrackingUpdate.ts';

/** Sign-in, sign-out, and the reference data every screen needs. */
export class AuthController extends ApiController {
  constructor(services: Services) {
    super(services);
  }

  override register(router: Router): void {
    router.post('/api/auth/sign-in', async (context) => {
      const session = await this.services.auth.signIn(context.body['username'], context.body['password']);
      const profile = await this.loadProfile(session.role, session.personId);
      return {
        token: session.token,
        role: session.role,
        username: session.username,
        personId: session.personId,
        branchId: session.branchId ?? null,
        expiresAt: session.expiresAt.toISOString(),
        profile,
      };
    });

    router.post('/api/auth/sign-out', async (context) => {
      if (context.token !== undefined) {
        this.services.auth.signOut(context.token);
      }
      return { signedOut: true };
    });

    router.get('/api/auth/session', async (context) => {
      const session = this.requireSession(context);
      return {
        role: session.role,
        username: session.username,
        personId: session.personId,
        branchId: session.branchId ?? null,
        expiresAt: session.expiresAt.toISOString(),
        profile: await this.loadProfile(session.role, session.personId),
      };
    });

    // Static reference data. Serving it from the server keeps the drop-down
    // options in the browser and the values the domain will accept in step.
    router.get('/api/reference', async () => ({
      cities: SERVICED_CITIES,
      vehicleTypes: VEHICLE_TYPES,
      licenceClasses: LICENCE_CLASSES,
      handlingClasses: HANDLING_CLASSES,
      serviceLevels: SERVICE_LEVELS,
      trackingStates: TRACKING_STATES,
      demoAccounts: SeedData.demoCredentials(),
      demoPassword: DEMO_PASSWORD,
      branches: (await this.services.fleet.listBranches()).map((branch) => Presenter.branch(branch)),
    }));
  }

  private async loadProfile(role: string, personId: string): Promise<Record<string, unknown> | null> {
    if (role === 'CUSTOMER') {
      return Presenter.customer(await this.services.accounts.findById(personId));
    }
    if (role === 'BRANCH_STAFF') {
      return Presenter.branch(await this.services.fleet.requireBranch(personId));
    }
    const drivers = await this.services.fleet.listDrivers();
    const driver = drivers.find((candidate) => candidate.id === personId);
    return driver === undefined ? null : Presenter.driver(driver);
  }
}
