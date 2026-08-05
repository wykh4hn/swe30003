import { Person } from './Person.ts';
import type { PersonRole } from './Person.ts';
import { Address } from '../shared/Address.ts';
import { ContactInfo } from '../shared/ContactInfo.ts';
import { Guard } from '../shared/Guard.ts';
import { RuleViolationError } from '../shared/DomainError.ts';

export const ACCOUNT_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'CLOSED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/**
 * Account holder that places, tracks and pays for shipment orders.
 *
 * Assignment 3 change C7: the Assignment 2 CRC card bundled six broad
 * responsibilities such as "maintain account identity, contact details,
 * authentication state and notification preference" into single rows. The marker
 * required these to be separated, because each has a different collaborator.
 * Each bundled row is now one focused method:
 *
 *   - `updateProfile`     collaborates with ContactInfo, Address
 *   - `enable/disableNotifications`   collaborates with nothing (own state)
 *   - `verifyContactDetails`          collaborates with nothing (own state)
 *   - `requestClosure`    collaborates with ShipmentOrder, Invoice (via the caller's counts)
 *   - `owns`              collaborates with ShipmentOrder
 *
 * Authentication state moved out entirely, to `UserAccount` (change C12): a
 * password is a security-tier concern, not a domain fact about a customer.
 */
export class Customer extends Person {
  private customerCompanyName: string | undefined;
  private customerBillingAddress: Address;
  private customerNotificationsEnabled: boolean;
  private customerAccountStatus: AccountStatus;
  private readonly customerRegisteredAt: Date;

  constructor(params: {
    id: string;
    fullName: string;
    contact: ContactInfo;
    billingAddress: Address;
    companyName?: string | undefined;
    notificationsEnabled?: boolean;
    accountStatus?: AccountStatus;
    registeredAt: Date;
    active?: boolean;
  }) {
    super(params.id, params.fullName, params.contact, params.active ?? true);
    this.customerCompanyName = Guard.optionalText('companyName', params.companyName, 120);
    this.customerBillingAddress = params.billingAddress;
    this.customerNotificationsEnabled = params.notificationsEnabled ?? true;
    this.customerAccountStatus = params.accountStatus ?? 'PENDING_VERIFICATION';
    this.customerRegisteredAt = params.registeredAt;
  }

  override role(): PersonRole {
    return 'CUSTOMER';
  }

  get companyName(): string | undefined {
    return this.customerCompanyName;
  }

  get billingAddress(): Address {
    return this.customerBillingAddress;
  }

  get notificationsEnabled(): boolean {
    return this.customerNotificationsEnabled;
  }

  get accountStatus(): AccountStatus {
    return this.customerAccountStatus;
  }

  get registeredAt(): Date {
    return this.customerRegisteredAt;
  }

  /** Assignment 1 Task 3, subtask 3: the account becomes usable once contact details check out. */
  verifyContactDetails(): void {
    if (this.customerAccountStatus === 'CLOSED') {
      throw new RuleViolationError('A closed account cannot be verified. Please register again.');
    }
    this.customerAccountStatus = 'ACTIVE';
  }

  /** Assignment 1 Task 3, subtask 4. */
  updateProfile(changes: { fullName?: string; contact?: ContactInfo; billingAddress?: Address; companyName?: string }): void {
    this.assertUsable();
    if (changes.fullName !== undefined) {
      this.rename(changes.fullName);
    }
    if (changes.contact !== undefined) {
      this.updateContact(changes.contact);
    }
    if (changes.billingAddress !== undefined) {
      this.customerBillingAddress = changes.billingAddress;
    }
    if (changes.companyName !== undefined) {
      this.customerCompanyName = Guard.optionalText('companyName', changes.companyName, 120);
    }
  }

  enableNotifications(): void {
    this.customerNotificationsEnabled = true;
  }

  disableNotifications(): void {
    this.customerNotificationsEnabled = false;
  }

  /**
   * Assignment 1 Task 3, variant 5a: closure is refused while the customer still
   * has live or unpaid work. The counts are supplied by the calling service,
   * which holds the repositories; the *rule* stays here, where the account
   * lifecycle lives.
   */
  requestClosure(openOrderCount: number, unpaidInvoiceCount: number): void {
    if (openOrderCount > 0) {
      throw new RuleViolationError(
        `Account cannot be closed while ${openOrderCount} order(s) are still active. Complete or cancel them first.`,
        { openOrderCount: String(openOrderCount) },
      );
    }
    if (unpaidInvoiceCount > 0) {
      throw new RuleViolationError(
        `Account cannot be closed while ${unpaidInvoiceCount} invoice(s) remain unpaid.`,
        { unpaidInvoiceCount: String(unpaidInvoiceCount) },
      );
    }
    this.customerAccountStatus = 'CLOSED';
    this.deactivate();
  }

  /** Assignment 1 Task 8, variant 1a: a customer must never see another customer's shipment. */
  owns(order: { customerId: string }): boolean {
    return order.customerId === this.id;
  }

  /** A customer may only transact once verification has completed. */
  assertUsable(): void {
    if (this.customerAccountStatus === 'CLOSED' || !this.isActive) {
      throw new RuleViolationError('This account is closed. Please contact ABC-Trans to reopen it.');
    }
    if (this.customerAccountStatus === 'PENDING_VERIFICATION') {
      throw new RuleViolationError(
        'This account is awaiting verification and has limited functionality. Verify your contact details to continue.',
      );
    }
  }

  protected override assertCanDeactivate(): void {
    // Closure rules are enforced by requestClosure(); deactivate() is the final step.
  }
}
