import { ApiController } from './ApiController.ts';
import type { Router } from '../Router.ts';
import type { Services } from '../../infrastructure/ApplicationContext.ts';
import { Presenter } from '../Presenter.ts';

/** Order Processing and Dispatch */
export class DispatchController extends ApiController {
  constructor(services: Services) {
    super(services);
  }

  override register(router: Router): void {
    // Assignment 1 Task 7 subtask 1: the branch's queue of pending orders.
    router.get('/api/branch/queue', async (context) => {
      const session = this.requireBranchSession(context);
      return (await this.services.dispatch.pendingQueue(session.branchId)).map((order) => Presenter.order(order));
    });

    router.get('/api/branch/orders', async (context) => {
      const session = this.requireBranchSession(context);
      return (await this.services.dispatch.branchOrders(session.branchId)).map((order) => Presenter.order(order));
    });

    // Verification report before deciding.
    router.get('/api/branch/orders/:orderId/review', async (context) => {
      const session = this.requireBranchSession(context);
      const orderId = this.param(context, 'orderId');
      const order = await this.services.dispatch.branchOrders(session.branchId);
      const target = order.find((candidate) => candidate.id === orderId);
      const customerName =
        target === undefined ? 'Unknown' : (await this.services.accounts.findById(target.customerId)).fullName;
      return this.services.dispatch.reviewOrder(session.branchId, orderId, customerName);
    });

    router.post('/api/branch/orders/:orderId/accept', async (context) => {
      const session = this.requireBranchSession(context);
      const order = await this.services.dispatch.acceptOrder(
        session.branchId,
        this.param(context, 'orderId'),
        String(context.body['staffName'] ?? session.username),
      );
      return Presenter.order(order);
    });

    router.post('/api/branch/orders/:orderId/reject', async (context) => {
      const session = this.requireBranchSession(context);
      const order = await this.services.dispatch.rejectOrder(
        session.branchId,
        this.param(context, 'orderId'),
        String(context.body['staffName'] ?? session.username),
        context.body['reason'],
      );
      return Presenter.order(order);
    });

    // Legal vehicle/driver pairings for this order, right now.
    router.get('/api/branch/orders/:orderId/suggestions', async (context) => {
      const session = this.requireBranchSession(context);
      return this.services.dispatch.suggestAssignments(session.branchId, this.param(context, 'orderId'));
    });

    // Bind resources, creating route + itineraries.
    router.post('/api/branch/orders/:orderId/assign', async (context) => {
      const session = this.requireBranchSession(context);
      const itineraries = await this.services.dispatch.assignResources(
        session.branchId,
        this.param(context, 'orderId'),
        (context.body['assignments'] as { vehicleId: unknown; driverId: unknown; weightKg?: unknown }[]) ?? [],
        String(context.body['staffName'] ?? session.username),
      );
      return itineraries.map((itinerary) => Presenter.itinerary(itinerary));
    });

    router.post('/api/branch/orders/:orderId/dispatch', async (context) => {
      const session = this.requireBranchSession(context);
      const order = await this.services.dispatch.dispatchOrder(
        session.branchId,
        this.param(context, 'orderId'),
        String(context.body['staffName'] ?? session.username),
      );
      const invoice = await this.services.billing.findInvoiceForOrder(order.id);
      return {
        order: Presenter.order(order),
        invoice: invoice === undefined ? null : Presenter.invoice(invoice, new Date()),
      };
    });
  }
}
