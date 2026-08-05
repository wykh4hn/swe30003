import { Repository } from './Repository.ts';
import { RecordMapper } from './RecordMapper.ts';
import type { JsonFileStore, StoredRecord } from './JsonFileStore.ts';
import { Customer } from '../../domain/people/Customer.ts';
import type { AccountStatus } from '../../domain/people/Customer.ts';
import { Driver } from '../../domain/people/Driver.ts';
import type { DriverAvailability, LicenceClass } from '../../domain/people/Driver.ts';
import { UserAccount } from '../../domain/people/UserAccount.ts';
import type { PersonRole } from '../../domain/people/Person.ts';

/** Persistence for customer accounts. */
export class CustomerRepository extends Repository<Customer> {
  constructor(store: JsonFileStore) {
    super(store, 'customers');
  }

  protected override toRecord(entity: Customer): StoredRecord {
    return {
      id: entity.id,
      fullName: entity.fullName,
      companyName: entity.companyName ?? null,
      contact: RecordMapper.contactToRecord(entity.contact),
      billingAddress: RecordMapper.addressToRecord(entity.billingAddress),
      notificationsEnabled: entity.notificationsEnabled,
      accountStatus: entity.accountStatus,
      registeredAt: RecordMapper.dateToRecord(entity.registeredAt),
      active: entity.isActive,
    };
  }

  protected override fromRecord(record: StoredRecord): Customer {
    return new Customer({
      id: String(record['id']),
      fullName: String(record['fullName']),
      companyName: RecordMapper.optionalTextFromRecord(record['companyName']),
      contact: RecordMapper.contactFromRecord(record['contact']),
      billingAddress: RecordMapper.addressFromRecord(record['billingAddress']),
      notificationsEnabled: Boolean(record['notificationsEnabled']),
      accountStatus: String(record['accountStatus']) as AccountStatus,
      registeredAt: RecordMapper.dateFromRecord(record['registeredAt']),
      active: Boolean(record['active']),
    });
  }

  /** Assignment 1 Task 3 variant 1a: duplicate registration must be detected. */
  async findByEmail(email: string): Promise<Customer | undefined> {
    const wanted = email.trim().toLowerCase();
    return this.findOneWhere((customer) => customer.contact.email === wanted);
  }
}

/** Persistence for drivers. */
export class DriverRepository extends Repository<Driver> {
  constructor(store: JsonFileStore) {
    super(store, 'drivers');
  }

  protected override toRecord(entity: Driver): StoredRecord {
    return {
      id: entity.id,
      fullName: entity.fullName,
      contact: RecordMapper.contactToRecord(entity.contact),
      branchId: entity.branchId,
      licenceNumber: entity.licenceNumber,
      licenceClass: entity.licenceClass,
      availability: entity.availability,
      leave: entity.leave === undefined ? null : RecordMapper.rangeToRecord(entity.leave),
      activeItineraryId: entity.activeItineraryId ?? null,
      active: entity.isActive,
    };
  }

  protected override fromRecord(record: StoredRecord): Driver {
    return new Driver({
      id: String(record['id']),
      fullName: String(record['fullName']),
      contact: RecordMapper.contactFromRecord(record['contact']),
      branchId: String(record['branchId']),
      licenceNumber: String(record['licenceNumber']),
      licenceClass: String(record['licenceClass']) as LicenceClass,
      availability: String(record['availability']) as DriverAvailability,
      leave: RecordMapper.optionalRangeFromRecord(record['leave']),
      activeItineraryId: RecordMapper.optionalTextFromRecord(record['activeItineraryId']),
      active: Boolean(record['active']),
    });
  }

  /** Change C3: the branch aggregates its drivers; the query lives here, not on `Branch`. */
  async findByBranch(branchId: string): Promise<Driver[]> {
    return this.findWhere((driver) => driver.branchId === branchId);
  }
}

/** Persistence for sign-in credentials (change C12). */
export class UserAccountRepository extends Repository<UserAccount> {
  constructor(store: JsonFileStore) {
    super(store, 'accounts');
  }

  protected override toRecord(entity: UserAccount): StoredRecord {
    return {
      id: entity.id,
      username: entity.username,
      personId: entity.personId,
      role: entity.role,
      branchId: entity.branchId ?? null,
      salt: entity.storedSalt,
      passwordDigest: entity.storedDigest,
    };
  }

  protected override fromRecord(record: StoredRecord): UserAccount {
    return UserAccount.rehydrate({
      id: String(record['id']),
      username: String(record['username']),
      personId: String(record['personId']),
      role: String(record['role']) as PersonRole,
      branchId: RecordMapper.optionalTextFromRecord(record['branchId']),
      salt: String(record['salt']),
      passwordDigest: String(record['passwordDigest']),
    });
  }

  async findByUsername(username: string): Promise<UserAccount | undefined> {
    const wanted = String(username ?? '').trim().toLowerCase();
    return this.findOneWhere((account) => account.username === wanted);
  }

  async findByPerson(personId: string): Promise<UserAccount | undefined> {
    return this.findOneWhere((account) => account.personId === personId);
  }
}
