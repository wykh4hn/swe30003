import { ApiController } from './ApiController.ts';
import type { Router } from '../Router.ts';
import type { Services } from '../../infrastructure/ApplicationContext.ts';
import { Presenter } from '../Presenter.ts';

/** Customer Account Management */
export class AccountController extends ApiController {
  constructor(services: Services) {
    super(services);
  }

  override register(router: Router): void {
    router.post('/api/customers', async (context) => {
      const customer = await this.services.accounts.register({
        fullName: context.body['fullName'],
        companyName: context.body['companyName'],
        email: context.body['email'],
        phone: context.body['phone'],
        password: context.body['password'],
        billingAddress: context.body['billingAddress'],
      });
      return Presenter.customer(customer);
    });

    router.get('/api/customers/me', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      return Presenter.customer(await this.services.accounts.findById(session.personId));
    });

    router.patch('/api/customers/me', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const customer = await this.services.accounts.updateProfile(session.personId, {
        fullName: context.body['fullName'],
        companyName: context.body['companyName'],
        email: context.body['email'],
        phone: context.body['phone'],
        billingAddress: context.body['billingAddress'],
      });
      return Presenter.customer(customer);
    });

    router.patch('/api/customers/me/notifications', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const customer = await this.services.accounts.setNotificationPreference(
        session.personId,
        context.body['enabled'] !== false,
      );
      return Presenter.customer(customer);
    });

    router.post('/api/customers/me/close', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const customer = await this.services.accounts.closeAccount(session.personId);
      this.services.auth.signOut(context.token ?? '');
      return Presenter.customer(customer);
    });

    router.get('/api/customers/me/notifications', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      return this.services.notifications.inboxFor(session.personId).map((message) => ({
        orderReference: message.orderReference,
        event: message.event,
        message: message.message,
        raisedAt: message.raisedAt.toISOString(),
      }));
    });

    router.get('/api/customers', async (context) => {
      this.requireSession(context, 'BRANCH_STAFF');
      return (await this.services.accounts.listAll()).map((customer) => Presenter.customer(customer));
    });
  }
}
