import { ApiController } from './ApiController.ts';
import type { Router } from '../Router.ts';
import type { Services } from '../../infrastructure/ApplicationContext.ts';
import { Presenter } from '../Presenter.ts';

/**
 * Business area 3 — Order Placement, Amendment and Cancellation
 * (Assignment 1 Tasks 4, 5 and 6).
 */
export class OrderController extends ApiController {
  constructor(services: Services) {
    super(services);
  }

  override register(router: Router): void {
    // Assignment 1 Task 4: browse, search and check availability.
    router.post('/api/availability', async (context) => {
      this.requireSession(context, 'CUSTOMER');
      const result = await this.services.orders.searchAvailability({
        cargo: context.body['cargo'],
        delivery: context.body['delivery'],
        preferredBranchId: context.body['preferredBranchId'],
      });
      return result;
    });

    // Assignment 1 Task 4 subtask 5: hold the chosen capacity while deciding.
    router.post('/api/reservations', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const now = new Date();
      const holds = await this.services.orders.reserveCapacity(
        session.personId,
        (context.body['vehicleIds'] as unknown[]) ?? [],
      );
      return holds.map((hold) => Presenter.hold(hold, now));
    });

    router.get('/api/reservations', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const now = new Date();
      const holds = await this.services.orders.activeReservations(session.personId);
      return holds.map((hold) => Presenter.hold(hold, now));
    });

    // The customer changed their mind: capacity returns to the pool immediately.
    router.delete('/api/reservations', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const released = await this.services.orders.releaseReservation(
        session.personId,
        (context.body['holdIds'] as unknown[]) ?? [],
      );
      return { released };
    });

    // Assignment 1 Task 5: place the order.
    router.post('/api/orders', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const order = await this.services.orders.placeOrder(session.personId, {
        branchId: context.body['branchId'],
        holdIds: (context.body['holdIds'] as unknown[]) ?? [],
        cargo: context.body['cargo'],
        delivery: context.body['delivery'],
      });
      return Presenter.order(order);
    });

    router.get('/api/orders', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      return (await this.services.orders.listForCustomer(session.personId)).map((order) => Presenter.order(order));
    });

    router.get('/api/orders/:orderId', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const order = await this.services.orders.getForCustomer(session.personId, this.param(context, 'orderId'));
      return Presenter.order(order);
    });

    // Assignment 1 Task 6: modify the order while it is still modifiable.
    router.patch('/api/orders/:orderId', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const order = await this.services.orders.amendOrder(session.personId, this.param(context, 'orderId'), {
        deliveryAddress: context.body['deliveryAddress'],
        requiredDeliveryBy: context.body['requiredDeliveryBy'],
        recipientName: context.body['recipientName'],
        recipientPhone: context.body['recipientPhone'],
      });
      return Presenter.order(order);
    });

    // Assignment 1 Task 6: cancel, releasing every resource the order held.
    router.post('/api/orders/:orderId/cancel', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const orderId = this.param(context, 'orderId');
      const order = await this.services.orders.cancelOrder(session.personId, orderId, context.body['reason']);
      // Variant 6a: a paid order that is cancelled is refunded, not deleted.
      const invoice = await this.services.billing.refundForCancelledOrder(orderId);
      return {
        order: Presenter.order(order),
        invoiceStatus: invoice?.status ?? null,
      };
    });
  }
}
