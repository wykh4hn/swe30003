import type { Entity } from '../../domain/shared/Entity.ts';
import { NotFoundError } from '../../domain/shared/DomainError.ts';
import type { JsonFileStore, StoredRecord } from './JsonFileStore.ts';

/**
 * Generic collection-oriented persistence for one kind of entity.
 *
 * Assignment 3 change C10 — the whole persistence design, which Assignment 2
 * deliberately excluded ("no database or UI class is introduced", assumption
 * A12). Excluding it was reasonable for a high-level design, but it left the
 * single largest gap to close for implementation.
 *
 * The Repository pattern was chosen over putting `save()`/`load()` on the
 * entities themselves, for three reasons:
 *
 *   1. **The domain stays pure.** No domain class imports `node:fs`. The whole
 *      of `server/domain` could run in a browser, in a test, or against a real
 *      database with no edit.
 *   2. **Object-record mapping is explicit.** Each concrete repository declares
 *      `toRecord`/`fromRecord`, so the "database design in an object-oriented
 *      manner" the brief asks for is visible and reviewable in one place per
 *      aggregate, rather than smeared across the domain.
 *   3. **The storage technology is replaceable.** Swapping JSON files for
 *      PostgreSQL means rewriting these subclasses and nothing above them.
 *
 * Subclasses supply only the collection name and the two mapping methods.
 */
export abstract class Repository<T extends Entity> {
  protected readonly store: JsonFileStore;
  protected readonly collection: string;

  protected constructor(store: JsonFileStore, collection: string) {
    this.store = store;
    this.collection = collection;
  }

  /** Projects an entity to a JSON-safe row. */
  protected abstract toRecord(entity: T): StoredRecord;

  /** Rebuilds an entity from a stored row. */
  protected abstract fromRecord(record: StoredRecord): T;

  async findById(id: string): Promise<T | undefined> {
    const rows = await this.store.read(this.collection);
    const row = rows.find((candidate) => candidate['id'] === id);
    return row === undefined ? undefined : this.fromRecord(row);
  }

  /** Same as `findById` but refuses to return `undefined`. */
  async requireById(id: string, label = this.collection): Promise<T> {
    const found = await this.findById(id);
    if (found === undefined) {
      throw new NotFoundError(label, id);
    }
    return found;
  }

  async findAll(): Promise<T[]> {
    const rows = await this.store.read(this.collection);
    return rows.map((row) => this.fromRecord(row));
  }

  async findWhere(predicate: (entity: T) => boolean): Promise<T[]> {
    return (await this.findAll()).filter(predicate);
  }

  async findOneWhere(predicate: (entity: T) => boolean): Promise<T | undefined> {
    return (await this.findAll()).find(predicate);
  }

  async exists(predicate: (entity: T) => boolean): Promise<boolean> {
    return (await this.findOneWhere(predicate)) !== undefined;
  }

  async count(predicate?: (entity: T) => boolean): Promise<number> {
    const all = await this.findAll();
    return predicate === undefined ? all.length : all.filter(predicate).length;
  }

  /** Inserts or replaces by identity. */
  async save(entity: T): Promise<T> {
    const rows = [...(await this.store.read(this.collection))];
    const record = this.toRecord(entity);
    const index = rows.findIndex((candidate) => candidate['id'] === entity.id);
    if (index >= 0) {
      rows[index] = record;
    } else {
      rows.push(record);
    }
    await this.store.write(this.collection, rows);
    return entity;
  }

  /** One write for many entities; used when a use case touches several at once. */
  async saveAll(entities: readonly T[]): Promise<void> {
    if (entities.length === 0) {
      return;
    }
    const rows = [...(await this.store.read(this.collection))];
    for (const entity of entities) {
      const record = this.toRecord(entity);
      const index = rows.findIndex((candidate) => candidate['id'] === entity.id);
      if (index >= 0) {
        rows[index] = record;
      } else {
        rows.push(record);
      }
    }
    await this.store.write(this.collection, rows);
  }

  /**
   * Physical removal. Used only for expired capacity holds; every business
   * entity is soft-deleted instead, because Assignment 1 requires history to
   * survive (Task 1 variant 5a, Task 2 variant 3a, Task 3 variant 5a).
   */
  async deleteById(id: string): Promise<void> {
    const rows = (await this.store.read(this.collection)).filter((row) => row['id'] !== id);
    await this.store.write(this.collection, rows);
  }

  /** Raw identities, used at bootstrap to keep the id generator ahead of storage. */
  async allIds(): Promise<string[]> {
    const rows = await this.store.read(this.collection);
    return rows.map((row) => String(row['id']));
  }
}
