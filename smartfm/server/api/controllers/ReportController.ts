import { ApiController } from './ApiController.ts';
import type { RequestContext, Router } from '../Router.ts';
import type { Services } from '../../infrastructure/ApplicationContext.ts';
import { Presenter } from '../Presenter.ts';

/**
 * Business area 7 — Management Reporting (Assignment 1 Task 10).
 *
 * Two endpoints, because change C2 split Assignment 2's single generic `Report`
 * into two focused reports. A branch sees its own figures by default and can ask
 * for the cross-branch view, which is the "combining data across all branches"
 * of Assignment 1 Task 10 subtask 3.
 */
export class ReportController extends ApiController {
  constructor(services: Services) {
    super(services);
  }

  override register(router: Router): void {
    router.get('/api/reports/shipments', async (context) => {
      const session = this.requireBranchSession(context);
      const report = await this.services.reporting.shipmentStatistics({
        preset: this.query(context, 'preset') ?? 'MONTH',
        start: this.query(context, 'start'),
        end: this.query(context, 'end'),
        branchId: this.scope(context, session.branchId),
      });
      return Presenter.shipmentStatistics(report);
    });

    router.get('/api/reports/resources', async (context) => {
      const session = this.requireBranchSession(context);
      const report = await this.services.reporting.resourceUtilisation({
        preset: this.query(context, 'preset') ?? 'MONTH',
        start: this.query(context, 'start'),
        end: this.query(context, 'end'),
        branchId: this.scope(context, session.branchId),
      });
      return Presenter.resourceUtilisation(report);
    });
  }

  /** `?scope=all` widens the report to every branch. */
  private scope(context: RequestContext, branchId: string): string | undefined {
    return this.query(context, 'scope') === 'all' ? undefined : branchId;
  }
}
