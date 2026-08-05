/**
 * Supplies the identities entities are created with.
 *
 * Assignment 3 change C10. The Assignment 2 design never said where an object's
 * identity comes from, which is another place an implementer had to guess. It is
 * injected for the same reason as the clock: the self-test suite needs
 * reproducible identifiers, and human-facing references (order `SFM-...`,
 * invoice `INV-...`, receipt `RCP-...`) must be generated consistently in one
 * place rather than formatted ad hoc at each call site.
 */
export interface IdGenerator {
  /** A technical identity, e.g. `ord_000017`. */
  next(prefix: string): string;

  /** A human-facing reference, e.g. `SFM-2026-000017`. */
  nextReference(prefix: string, year: number): string;
}

/** Monotonic counters per prefix. Adequate for a single-process application. */
export class SequentialIdGenerator implements IdGenerator {
  private readonly counters = new Map<string, number>();

  constructor(seed: Record<string, number> = {}) {
    for (const [prefix, value] of Object.entries(seed)) {
      this.counters.set(prefix, value);
    }
  }

  next(prefix: string): string {
    return `${prefix}_${String(this.bump(prefix)).padStart(6, '0')}`;
  }

  nextReference(prefix: string, year: number): string {
    return `${prefix}-${year}-${String(this.bump(`ref:${prefix}`)).padStart(6, '0')}`;
  }

  /**
   * Keeps counters ahead of identities already in storage, so a restart never
   * reissues an identifier that a persisted object already holds.
   */
  observeExisting(prefix: string, id: string): void {
    const match = /_(\d+)$/.exec(id);
    if (match?.[1] === undefined) {
      return;
    }
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > (this.counters.get(prefix) ?? 0)) {
      this.counters.set(prefix, value);
    }
  }

  observeExistingReference(prefix: string, reference: string): void {
    const match = /-(\d+)$/.exec(reference);
    if (match?.[1] === undefined) {
      return;
    }
    const key = `ref:${prefix}`;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > (this.counters.get(key) ?? 0)) {
      this.counters.set(key, value);
    }
  }

  private bump(key: string): number {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }
}
