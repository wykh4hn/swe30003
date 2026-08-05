/**
 * Root of the entity hierarchy.
 *
 * An entity is a domain object with a lifecycle and a stable identity: two
 * `Vehicle` objects with identical attributes are still different vehicles.
 * Value objects (`Money`, `Address`, `ContactInfo`, `DateRange`) deliberately do
 * NOT extend this class — they are compared by value.
 *
 * Added in the Assignment 3 detailed design; the Assignment 2 class diagram left
 * object identity implicit, which is not implementable.
 */
export abstract class Entity {
  readonly id: string;

  protected constructor(id: string) {
    this.id = id;
  }

  /** Entities are equal when they are the same class and carry the same identity. */
  equals(other: Entity | null | undefined): boolean {
    if (!other) {
      return false;
    }
    return this.constructor === other.constructor && this.id === other.id;
  }

  toString(): string {
    return `${this.constructor.name}(${this.id})`;
  }
}
