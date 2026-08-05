import { ApiController } from './ApiController.ts';
import type { Router } from '../Router.ts';
import type { Services } from '../../infrastructure/ApplicationContext.ts';
import { Presenter } from '../Presenter.ts';
import { NotFoundError } from '../../domain/shared/DomainError.ts';

/**
 * Business area 5 — Billing and Payment (Assignment 1 Task 9).
 *
 * Settlement is simulated throughout, as the Assignment 3 specification allows.
 * The response always carries the strategy's own message, which states plainly
 * that no banking system was contacted.
 */
export class BillingController extends ApiController {
  constructor(services: Services) {
    super(services);
  }

  override register(router: Router): void {
    router.get('/api/invoices', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const now = new Date();
      return (await this.services.billing.listInvoicesForCustomer(session.personId)).map((invoice) =>
        Presenter.invoice(invoice, now),
      );
    });

    router.get('/api/orders/:orderId/invoice', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const orderId = this.param(context, 'orderId');
      // Reading through the order enforces the ownership check first.
      await this.services.orders.getForCustomer(session.personId, orderId);
      const invoice = await this.services.billing.findInvoiceForOrder(orderId);
      if (invoice === undefined) {
        throw new NotFoundError('Invoice for order', orderId);
      }
      return Presenter.invoice(invoice, new Date());
    });

    // Assignment 1 Task 9: pay. Cash and card go through the same endpoint and
    // the same Payment object; only the strategy differs.
    router.post('/api/invoices/:invoiceId/payments', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const outcome = await this.services.billing.payInvoice(session.personId, this.param(context, 'invoiceId'), {
        method: context.body['method'],
        cash: context.body['cash'],
        card: context.body['card'],
      });
      return {
        succeeded: outcome.succeeded,
        message: outcome.message,
        retryable: outcome.retryable,
        invoiceStatus: outcome.invoiceStatus,
        receipt: outcome.receipt === undefined ? null : Presenter.receipt(outcome.receipt),
      };
    });

    // Assignment 1 Task 9 subtask 5: every attempt is on record, not just the successful one.
    router.get('/api/invoices/:invoiceId/payments', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      const invoices = await this.services.billing.listInvoicesForCustomer(session.personId);
      const invoiceId = this.param(context, 'invoiceId');
      if (!invoices.some((invoice) => invoice.id === invoiceId)) {
        throw new NotFoundError('Invoice', invoiceId);
      }
      return (await this.services.billing.listAttempts(invoiceId)).map((payment) => Presenter.payment(payment));
    });

    router.get('/api/receipts', async (context) => {
      const session = this.requireSession(context, 'CUSTOMER');
      return (await this.services.billing.listReceiptsForCustomer(session.personId)).map((receipt) =>
        Presenter.receipt(receipt),
      );
    });
  }
}
