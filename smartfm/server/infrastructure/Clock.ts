/**
 * Source of "now" for the whole application.
 *
 * Assignment 3 change C10 (infrastructure). Assignment 2's domain classes read
 * the current time implicitly. Every rule in SmartFM is time-sensitive — hold
 * expiry, leave overlap, invoice due dates, report periods — so an implementation
 * that calls `new Date()` inside domain objects cannot be tested at all: a test
 * for "the hold expired" would have to wait fifteen real minutes.
 *
 * Time is therefore injected. `SystemClock` runs in production; `FixedClock`
 * lets the self-test suite step time forward instantly.
 */
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Test double: time only moves when the test moves it. */
export class FixedClock implements Clock {
  private current: Date;

  constructor(start: Date) {
    this.current = new Date(start.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }

  advanceDays(days: number): void {
    this.advanceMinutes(days * 24 * 60);
  }

  set(moment: Date): void {
    this.current = new Date(moment.getTime());
  }
}
