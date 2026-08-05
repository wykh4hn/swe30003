import { ApiController } from './ApiController.ts';
import type { Router } from '../Router.ts';
import type { Services } from '../../infrastructure/ApplicationContext.ts';
import { Presenter } from '../Presenter.ts';

/** Shipment Tracking */
export class TrackingController extends ApiController {
  constructor(services: Services) {
    super(services);
  }

  override register(router: Router): void {
    // The customer's timeline and ETA.
    router.get('/api/orders/:orderId/tracking', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      return this.services.tracking.timelineForCustomer(session.personId, this.param(context, 'orderId'));
    });

    // Lookup by the printed reference, as at a branch counter.
    router.get('/api/tracking/:reference', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      return this.services.tracking.timelineByReference(session.personId, this.param(context, 'reference'));
    });

    // The driver's live jobs.
    router.get('/api/driver/jobs', async (context) => {
      const session = this.requireSession(context, 'DRIVER');
      return this.services.tracking.jobsForDriver(session.personId);
    });

    // The driver posts a checkpoint; the order validates and appends it.
    router.post('/api/driver/updates', async (context) => {
      const session = this.requireSession(context, 'DRIVER');
      const order = await this.services.tracking.recordUpdate(session.personId, {
        itineraryId: context.body['itineraryId'],
        state: context.body['state'],
        locationLabel: context.body['locationLabel'],
        estimatedArrival: context.body['estimatedArrival'],
        note: context.body['note'],
      });
      return Presenter.order(order);
    });
  }
}
