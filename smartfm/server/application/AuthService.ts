import { randomBytes } from 'node:crypto';
import { AuthorisationError, ValidationError } from '../domain/shared/DomainError.ts';
import type { PersonRole } from '../domain/people/Person.ts';
import { UserAccount } from '../domain/people/UserAccount.ts';
import type { UserAccountRepository } from '../infrastructure/persistence/PeopleRepositories.ts';
import type { Clock } from '../infrastructure/Clock.ts';
import type { IdGenerator } from '../infrastructure/IdGenerator.ts';

/** Who a request is being made by, resolved from its bearer token. */
export interface Session {
  readonly token: string;
  readonly accountId: string;
  readonly personId: string;
  readonly username: string;
  readonly role: PersonRole;
  readonly branchId: string | undefined;
  readonly expiresAt: Date;
}

const SESSION_HOURS = 8;

/**
 * Signs users in and resolves the caller behind each request.
 *
 * Assignment 3 change C12. Assignment 1 identified three actors with sharply
 * different permissions — a customer may see only their own shipments (Task 8
 * variant 1a), only a branch may accept an order (Task 7), only the assigned
 * driver may post tracking (Task 8) — but Assignment 2 modelled no notion of
 * "who is asking". Every one of those rules is unimplementable without it, so
 * this service and `UserAccount` had to be added.
 *
 * Sessions are held in memory: they are a security-tier concern with no domain
 * meaning, and a restart legitimately signs everybody out.
 */
export class AuthService {
  private readonly accounts: UserAccountRepository;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;
  private readonly sessions = new Map<string, Session>();

  constructor(accounts: UserAccountRepository, clock: Clock, ids: IdGenerator) {
    this.accounts = accounts;
    this.clock = clock;
    this.ids = ids;
  }

  async createAccount(params: {
    username: unknown;
    password: unknown;
    personId: string;
    role: PersonRole;
    branchId?: string | undefined;
  }): Promise<UserAccount> {
    const existing = await this.accounts.findByUsername(String(params.username ?? ''));
    if (existing !== undefined) {
      throw new ValidationError('username', 'An account already exists for this email address. Sign in instead.');
    }
    const account = UserAccount.register({
      id: this.ids.next('acc'),
      username: params.username,
      password: params.password,
      personId: params.personId,
      role: params.role,
      branchId: params.branchId,
    });
    return this.accounts.save(account);
  }

  /**
   * A failed sign-in never reveals whether the username exists — the same
   * message is returned for an unknown user and a wrong password.
   */
  async signIn(username: unknown, password: unknown): Promise<Session> {
    const account = await this.accounts.findByUsername(String(username ?? ''));
    if (account === undefined || !account.verifyPassword(password)) {
      throw new AuthorisationError('The email address or password is incorrect.');
    }
    const now = this.clock.now();
    const session: Session = {
      token: randomBytes(24).toString('hex'),
      accountId: account.id,
      personId: account.personId,
      username: account.username,
      role: account.role,
      branchId: account.branchId,
      expiresAt: new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000),
    };
    this.sessions.set(session.token, session);
    return session;
  }

  signOut(token: string): void {
    this.sessions.delete(token);
  }

  /** Resolves a bearer token, dropping it if it has expired. */
  resolve(token: string | undefined): Session | undefined {
    if (token === undefined || token === '') {
      return undefined;
    }
    const session = this.sessions.get(token);
    if (session === undefined) {
      return undefined;
    }
    if (session.expiresAt.getTime() <= this.clock.now().getTime()) {
      this.sessions.delete(token);
      return undefined;
    }
    return session;
  }

  /** Resolves a token or refuses the request. */
  require(token: string | undefined): Session {
    const session = this.resolve(token);
    if (session === undefined) {
      throw new AuthorisationError('Your session has expired. Please sign in again.');
    }
    return session;
  }

  /** Resolves a token and checks the caller holds one of the permitted roles. */
  requireRole(token: string | undefined, ...roles: readonly PersonRole[]): Session {
    const session = this.require(token);
    if (!roles.includes(session.role)) {
      throw new AuthorisationError('Your account does not have access to this function.');
    }
    return session;
  }
}
