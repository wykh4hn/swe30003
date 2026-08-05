import { Customer } from '../domain/people/Customer.ts';
import { Address } from '../domain/shared/Address.ts';
import { ContactInfo } from '../domain/shared/ContactInfo.ts';
import { ValidationError } from '../domain/shared/DomainError.ts';
import type { CustomerRepository } from '../infrastructure/persistence/PeopleRepositories.ts';
import type { ShipmentOrderRepository } from '../infrastructure/persistence/OrderingRepositories.ts';
import type { InvoiceRepository } from '../infrastructure/persistence/BillingRepositories.ts';
import type { Clock } from '../infrastructure/Clock.ts';
import type { IdGenerator } from '../infrastructure/IdGenerator.ts';
import type { AuthService } from './AuthService.ts';
import type { NotificationService } from './NotificationService.ts';

/**
 * Business area 1 — Customer Account Management (Assignment 1 Task 3).
 *
 * One of the seven application services that replace Assignment 2's
 * `SmartFMSystem` (change C1). The marker's objection was that `SmartFMSystem`
 * "is not a domain class", and implementation confirmed it: a single class
 * coordinating registration, fleet, ordering, dispatch, tracking, billing and
 * reporting is a god class by construction, with seven unrelated reasons to
 * change. Each business area now has its own service, and each depends only on
 * the repositories its own use cases touch.
 *
 * The service *coordinates*; it does not own rules. Whether an account may close
 * is decided by `Customer.requestClosure()`, because that is a fact about an
 * account's lifecycle. What the service contributes is the information the
 * domain object cannot reach on its own — the counts of open orders and unpaid
 * invoices — which is exactly the division of labour responsibility-driven
 * design prescribes.
 */
export class AccountService {
  private readonly customers: CustomerRepository;
  private readonly orders: ShipmentOrderRepository;
  private readonly invoices: InvoiceRepository;
  private readonly auth: AuthService;
  private readonly notifications: NotificationService;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  constructor(dependencies: {
    customers: CustomerRepository;
    orders: ShipmentOrderRepository;
    invoices: InvoiceRepository;
    auth: AuthService;
    notifications: NotificationService;
    clock: Clock;
    ids: IdGenerator;
  }) {
    this.customers = dependencies.customers;
    this.orders = dependencies.orders;
    this.invoices = dependencies.invoices;
    this.auth = dependencies.auth;
    this.notifications = dependencies.notifications;
    this.clock = dependencies.clock;
    this.ids = dependencies.ids;
  }

  /**
   * Assignment 1 Task 3 subtasks 1-3, including variant 1a (duplicate
   * registration is detected and redirected to sign-in rather than creating a
   * second account).
   */
  async register(input: {
    fullName: unknown;
    companyName?: unknown;
    email: unknown;
    phone: unknown;
    password: unknown;
    billingAddress: unknown;
  }): Promise<Customer> {
    const contact = ContactInfo.create({ email: input.email, phone: input.phone });
    const billingAddress = Address.create(input.billingAddress as never, 'billingAddress');

    const duplicate = await this.customers.findByEmail(contact.email);
    if (duplicate !== undefined) {
      throw new ValidationError(
        'email',
        'An account already exists for this email address. Please sign in or recover your password instead.',
      );
    }

    const customer = new Customer({
      id: this.ids.next('cus'),
      fullName: String(input.fullName ?? ''),
      companyName: input.companyName === undefined ? undefined : String(input.companyName),
      contact,
      billingAddress,
      registeredAt: this.clock.now(),
    });

    // Assignment 1 Task 3 subtask 3: contact verification is simulated here, so
    // the demonstration can proceed straight to ordering. A production system
    // would activate the account only after a verification link was followed.
    customer.verifyContactDetails();

    await this.customers.save(customer);
    await this.auth.createAccount({
      username: contact.email,
      password: input.password,
      personId: customer.id,
      role: 'CUSTOMER',
    });
    return customer;
  }

  async findById(customerId: string): Promise<Customer> {
    return this.customers.requireById(customerId, 'Customer');
  }

  /** Assignment 1 Task 3 subtask 4. */
  async updateProfile(
    customerId: string,
    changes: {
      fullName?: unknown;
      companyName?: unknown;
      email?: unknown;
      phone?: unknown;
      billingAddress?: unknown;
    },
  ): Promise<Customer> {
    const customer = await this.findById(customerId);

    let contact: ContactInfo | undefined;
    if (changes.email !== undefined || changes.phone !== undefined) {
      contact = ContactInfo.create({
        email: changes.email ?? customer.contact.email,
        phone: changes.phone ?? customer.contact.phone,
      });
      if (contact.email !== customer.contact.email) {
        const clash = await this.customers.findByEmail(contact.email);
        if (clash !== undefined && clash.id !== customer.id) {
          throw new ValidationError('email', 'That email address is already used by another account.');
        }
      }
    }

    customer.updateProfile({
      ...(changes.fullName !== undefined ? { fullName: String(changes.fullName) } : {}),
      ...(changes.companyName !== undefined ? { companyName: String(changes.companyName) } : {}),
      ...(contact !== undefined ? { contact } : {}),
      ...(changes.billingAddress !== undefined
        ? { billingAddress: Address.create(changes.billingAddress as never, 'billingAddress') }
        : {}),
    });

    return this.customers.save(customer);
  }

  /** Assignment 1 Task 8 subtask 4: opting in and out of status notifications. */
  async setNotificationPreference(customerId: string, enabled: boolean): Promise<Customer> {
    const customer = await this.findById(customerId);
    if (enabled) {
      customer.enableNotifications();
    } else {
      customer.disableNotifications();
    }
    this.notifications.setPreference(customer.id, enabled);
    return this.customers.save(customer);
  }

  /**
   * Assignment 1 Task 3 subtask 5 and variant 5a. The service gathers the two
   * counts; `Customer` applies the rule and refuses if either is non-zero.
   */
  async closeAccount(customerId: string): Promise<Customer> {
    const customer = await this.findById(customerId);
    const openOrders = await this.orders.findOpenForCustomer(customerId);
    const unpaidInvoices = await this.invoices.countOutstandingForCustomer(customerId);

    customer.requestClosure(openOrders.length, unpaidInvoices);
    return this.customers.save(customer);
  }

  async reopenAccount(customerId: string): Promise<Customer> {
    const customer = await this.findById(customerId);
    customer.reactivate();
    customer.verifyContactDetails();
    return this.customers.save(customer);
  }

  async listAll(): Promise<Customer[]> {
    return this.customers.findAll();
  }
}
