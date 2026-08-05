import { Entity } from '../shared/Entity.ts';
import { ContactInfo } from '../shared/ContactInfo.ts';
import { Guard } from '../shared/Guard.ts';
import { RuleViolationError } from '../shared/DomainError.ts';

/** The three kinds of people who interact with SmartFM. */
export const PERSON_ROLES = ['CUSTOMER', 'DRIVER', 'BRANCH_STAFF'] as const;
export type PersonRole = (typeof PERSON_ROLES)[number];

/**
 * Shared identity abstraction for people who interact with SmartFM.
 *
 * Retained unchanged in intent from Assignment 2 (non-change N1): `Customer` and
 * `Driver` are genuinely substitutable wherever "a person known to SmartFM" is
 * required, so inheritance is justified rather than convenient.
 *
 * What did change is the responsibility split. In Assignment 2 the `Person` CRC
 * card only said it "defines the shared abstraction". In the detailed design it
 * owns concrete behaviour — name and contact upkeep, and the activate/deactivate
 * lifecycle shared by both subclasses — so it is not a hollow marker class.
 */
export abstract class Person extends Entity {
  private personFullName: string;
  private personContact: ContactInfo;
  private personActive: boolean;

  protected constructor(id: string, fullName: string, contact: ContactInfo, active = true) {
    super(id);
    this.personFullName = Guard.text('fullName', fullName, 2, 100);
    this.personContact = contact;
    this.personActive = active;
  }

  get fullName(): string {
    return this.personFullName;
  }

  get contact(): ContactInfo {
    return this.personContact;
  }

  get isActive(): boolean {
    return this.personActive;
  }

  /** Which portal this person signs in to. */
  abstract role(): PersonRole;

  rename(fullName: string): void {
    this.personFullName = Guard.text('fullName', fullName, 2, 100);
  }

  updateContact(contact: ContactInfo): void {
    this.personContact = contact;
  }

  /**
   * Soft delete. Assignment 1 requires history to survive removal, so subclasses
   * override `assertCanDeactivate()` to refuse while open work exists rather
   * than the record ever being erased.
   */
  deactivate(): void {
    this.assertCanDeactivate();
    this.personActive = false;
  }

  reactivate(): void {
    this.personActive = true;
  }

  /** Subclass hook: throw when outstanding obligations block deactivation. */
  protected assertCanDeactivate(): void {
    if (!this.personActive) {
      throw new RuleViolationError(`${this.constructor.name} '${this.fullName}' is already inactive.`);
    }
  }
}
