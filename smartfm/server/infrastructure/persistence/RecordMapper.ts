import { Address } from '../../domain/shared/Address.ts';
import { ContactInfo } from '../../domain/shared/ContactInfo.ts';
import { DateRange } from '../../domain/shared/DateRange.ts';
import { Money } from '../../domain/shared/Money.ts';
import type { StoredRecord } from './JsonFileStore.ts';

/**
 * Conversions shared by every repository's `toRecord` / `fromRecord`.
 *
 * Value objects have no identity of their own, so they are stored *inline* in
 * their owner's row rather than in separate collections. That is the object-
 * oriented counterpart of the decision not to normalise them into tables: an
 * `Address` has no independent lifecycle, so giving it a primary key would be
 * modelling the storage rather than the domain.
 */
export class RecordMapper {
  private constructor() {
    // Static utility; never instantiated.
  }

  static dateToRecord(value: Date): string {
    return value.toISOString();
  }

  static optionalDateToRecord(value: Date | undefined): string | null {
    return value === undefined ? null : value.toISOString();
  }

  static dateFromRecord(value: unknown): Date {
    return new Date(String(value));
  }

  static optionalDateFromRecord(value: unknown): Date | undefined {
    return value === null || value === undefined ? undefined : new Date(String(value));
  }

  static optionalTextFromRecord(value: unknown): string | undefined {
    return value === null || value === undefined ? undefined : String(value);
  }

  static moneyToRecord(value: Money): number {
    return value.amount;
  }

  static moneyFromRecord(value: unknown): Money {
    return Money.of(Number(value ?? 0));
  }

  static addressToRecord(value: Address): StoredRecord {
    return { street: value.street, district: value.district, city: value.city };
  }

  static addressFromRecord(value: unknown): Address {
    const record = (value ?? {}) as Record<string, unknown>;
    return Address.create({ street: record['street'], district: record['district'], city: record['city'] });
  }

  static contactToRecord(value: ContactInfo): StoredRecord {
    return { email: value.email, phone: value.phone };
  }

  static contactFromRecord(value: unknown): ContactInfo {
    const record = (value ?? {}) as Record<string, unknown>;
    return ContactInfo.create({ email: record['email'], phone: record['phone'] });
  }

  static rangeToRecord(value: DateRange): StoredRecord {
    return { start: value.start.toISOString(), end: value.end.toISOString() };
  }

  static rangeFromRecord(value: unknown): DateRange {
    const record = (value ?? {}) as Record<string, unknown>;
    return DateRange.create(record['start'], record['end']);
  }

  static optionalRangeFromRecord(value: unknown): DateRange | undefined {
    return value === null || value === undefined ? undefined : RecordMapper.rangeFromRecord(value);
  }

  /** Reads a nested object safely; stored rows are untyped by construction. */
  static nested(record: StoredRecord, key: string): Record<string, unknown> {
    return (record[key] ?? {}) as Record<string, unknown>;
  }

  /** Reads an array of nested objects safely. */
  static nestedList(record: StoredRecord, key: string): Record<string, unknown>[] {
    const value = record[key];
    return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  }

  static stringList(record: StoredRecord, key: string): string[] {
    const value = record[key];
    return Array.isArray(value) ? value.map((item) => String(item)) : [];
  }
}
