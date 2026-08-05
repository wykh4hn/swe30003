import type { Router, RequestContext } from '../Router.ts';
import type { Services } from '../../infrastructure/ApplicationContext.ts';
import type { Session } from '../../application/AuthService.ts';
import type { PersonRole } from '../../domain/people/Person.ts';
import { AuthorisationError, ValidationError } from '../../domain/shared/DomainError.ts';

/**
 * Base class for the eight controllers, one per business area plus sign-in.
 *
 * A controller's whole job is to turn an HTTP request into a call on one
 * application service and a JSON response. It contains no business rules — if a
 * controller method ever grew an `if` about domain state, that rule would belong
 * in the domain or the service instead. Keeping them this thin is what makes the
 * layering claim in the architecture section verifiable by inspection.
 */
export abstract class ApiController {
  protected readonly services: Services;

  protected constructor(services: Services) {
    this.services = services;
  }

  /** Attaches this controller's endpoints to the shared router. */
  abstract register(router: Router): void;

  /** Resolves the caller, refusing the request if the session is missing or expired. */
  protected requireSession(context: RequestContext, ...roles: readonly PersonRole[]): Session {
    const session = context.session;
    if (session === undefined) {
      throw new AuthorisationError('Please sign in to continue.');
    }
    if (roles.length > 0 && !roles.includes(session.role)) {
      throw new AuthorisationError('Your account does not have access to this function.');
    }
    return session;
  }

  /** The branch a staff session acts for. */
  protected requireBranchSession(context: RequestContext): Session & { branchId: string } {
    const session = this.requireSession(context, 'BRANCH_STAFF');
    if (session.branchId === undefined) {
      throw new AuthorisationError('This staff account is not linked to a branch.');
    }
    return { ...session, branchId: session.branchId };
  }

  /** Reads a required path parameter. */
  protected param(context: RequestContext, name: string): string {
    const value = context.params[name];
    if (value === undefined || value === '') {
      throw new ValidationError(name, `${name} is required.`);
    }
    return value;
  }

  /** Reads an optional query-string value. */
  protected query(context: RequestContext, name: string): string | undefined {
    const value = context.query[name];
    return value === undefined || value === '' ? undefined : value;
  }
}
