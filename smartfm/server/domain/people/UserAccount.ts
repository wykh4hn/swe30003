import { createHash, randomBytes } from 'node:crypto';
import { Entity } from '../shared/Entity.ts';
import { Guard } from '../shared/Guard.ts';
import type { PersonRole } from './Person.ts';

/**
 * Sign-in credentials, separated from the `Person` who owns them.
 *
 * Assignment 3 change C12. Assignment 2 put "authentication state" on the
 * `Customer` CRC card and had no concept at all for branch staff or driver
 * sign-in, even though Assignment 1 identified three distinct actors. An
 * implementation cannot leave that ambiguous — every request has to be
 * attributable to a role before any use case can decide what is permitted.
 *
 * Storing a salted hash rather than the password is a security-tier decision
 * that also keeps `Customer` free of security concerns (one key abstraction per
 * class). The digest below is deliberately simple and self-contained: SmartFM is
 * a teaching implementation and no production credential store is in scope.
 */
export class UserAccount extends Entity {
  readonly username: string;
  readonly personId: string;
  readonly role: PersonRole;
  readonly branchId: string | undefined;
  private salt: string;
  private passwordDigest: string;

  private constructor(params: {
    id: string;
    username: string;
    personId: string;
    role: PersonRole;
    branchId: string | undefined;
    salt: string;
    passwordDigest: string;
  }) {
    super(params.id);
    this.username = params.username;
    this.personId = params.personId;
    this.role = params.role;
    this.branchId = params.branchId;
    this.salt = params.salt;
    this.passwordDigest = params.passwordDigest;
  }

  /** Creates an account from a plaintext password, which is never retained. */
  static register(params: {
    id: string;
    username: unknown;
    password: unknown;
    personId: string;
    role: PersonRole;
    branchId?: string | undefined;
  }): UserAccount {
    const username = Guard.email('username', params.username);
    const password = Guard.text('password', params.password, 8, 72);
    const salt = randomBytes(16).toString('hex');
    return new UserAccount({
      id: params.id,
      username,
      personId: params.personId,
      role: params.role,
      branchId: params.branchId,
      salt,
      passwordDigest: UserAccount.digest(password, salt),
    });
  }

  /** Rebuilds a stored account. Used only by the persistence layer. */
  static rehydrate(params: {
    id: string;
    username: string;
    personId: string;
    role: PersonRole;
    branchId: string | undefined;
    salt: string;
    passwordDigest: string;
  }): UserAccount {
    return new UserAccount(params);
  }

  private static digest(password: string, salt: string): string {
    return createHash('sha256').update(`${salt}:${password}`).digest('hex');
  }

  verifyPassword(candidate: unknown): boolean {
    if (typeof candidate !== 'string' || candidate.length === 0) {
      return false;
    }
    return UserAccount.digest(candidate, this.salt) === this.passwordDigest;
  }

  changePassword(newPassword: unknown): void {
    const password = Guard.text('password', newPassword, 8, 72);
    this.salt = randomBytes(16).toString('hex');
    this.passwordDigest = UserAccount.digest(password, this.salt);
  }

  /** Persistence-only accessors; the digest never leaves the server tier. */
  get storedSalt(): string {
    return this.salt;
  }

  get storedDigest(): string {
    return this.passwordDigest;
  }
}
