import { Guard } from './Guard.ts';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * An immutable inclusive-start, exclusive-end period.
 *
 * Assignment 3 change C11. Used for driver leave, vehicle maintenance windows,
 * itinerary scheduling and reporting periods. Concentrating overlap arithmetic
 * here is what allows `Itinerary.conflictsWith()` to be a two-line method rather
 * than repeated date comparisons scattered across the dispatch logic.
 */
export class DateRange {
  readonly start: Date;
  readonly end: Date;

  private constructor(start: Date, end: Date) {
    this.start = start;
    this.end = end;
  }

  static create(start: unknown, end: unknown, fieldPrefix = 'period'): DateRange {
    const parsedStart = Guard.date(`${fieldPrefix}.start`, start);
    const parsedEnd = Guard.date(`${fieldPrefix}.end`, end);
    Guard.after(`${fieldPrefix}.end`, parsedEnd, parsedStart, `${fieldPrefix}.start`);
    return new DateRange(parsedStart, parsedEnd);
  }

  /** A whole number of days starting at `start`. */
  static ofDays(start: Date, days: number): DateRange {
    return new DateRange(start, new Date(start.getTime() + days * MILLISECONDS_PER_DAY));
  }

  contains(moment: Date): boolean {
    return moment.getTime() >= this.start.getTime() && moment.getTime() < this.end.getTime();
  }

  /** True when the two periods share at least one instant. */
  overlaps(other: DateRange): boolean {
    return this.start.getTime() < other.end.getTime() && other.start.getTime() < this.end.getTime();
  }

  durationHours(): number {
    return (this.end.getTime() - this.start.getTime()) / (60 * 60 * 1000);
  }

  durationDays(): number {
    return (this.end.getTime() - this.start.getTime()) / MILLISECONDS_PER_DAY;
  }

  format(): string {
    return `${this.start.toISOString().slice(0, 10)} to ${this.end.toISOString().slice(0, 10)}`;
  }
}
