import { DateRange } from '../shared/DateRange.ts';
import { Guard } from '../shared/Guard.ts';

export const PERIOD_PRESETS = ['DAY', 'WEEK', 'MONTH', 'YEAR_TO_DATE', 'CUSTOM'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/**
 * The reporting window, with the presets Assignment 1 Task 10 subtask 1 named.
 *
 * Part of change C2. Assignment 2 had one generic `Report` class that was
 * expected to know periods, statistics, utilisation and empty-result handling
 * all at once; the marker judged it "too generic". Pulling the period out is the
 * first step of that split: the two concrete report classes now share one
 * validated window rather than each re-implementing date handling.
 */
export class ReportPeriod {
  readonly preset: PeriodPreset;
  readonly range: DateRange;
  readonly label: string;

  private constructor(preset: PeriodPreset, range: DateRange, label: string) {
    this.preset = preset;
    this.range = range;
    this.label = label;
  }

  static day(now: Date): ReportPeriod {
    const start = ReportPeriod.startOfDay(now);
    return new ReportPeriod('DAY', DateRange.ofDays(start, 1), `Day — ${start.toISOString().slice(0, 10)}`);
  }

  static week(now: Date): ReportPeriod {
    const start = ReportPeriod.startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
    return new ReportPeriod('WEEK', DateRange.ofDays(start, 7), 'Last 7 days');
  }

  static month(now: Date): ReportPeriod {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return new ReportPeriod(
      'MONTH',
      DateRange.create(start, end, 'period'),
      `Month — ${start.toISOString().slice(0, 7)}`,
    );
  }

  static yearToDate(now: Date): ReportPeriod {
    const start = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getTime() + 1000);
    return new ReportPeriod('YEAR_TO_DATE', DateRange.create(start, end, 'period'), `Year to date — ${now.getFullYear()}`);
  }

  static custom(start: unknown, end: unknown): ReportPeriod {
    const range = DateRange.create(start, end, 'period');
    return new ReportPeriod('CUSTOM', range, `Custom — ${range.format()}`);
  }

  /** Builds the period a request asked for, defaulting to the current month. */
  static resolve(preset: unknown, now: Date, start?: unknown, end?: unknown): ReportPeriod {
    const chosen = Guard.oneOf('preset', preset ?? 'MONTH', PERIOD_PRESETS);
    switch (chosen) {
      case 'DAY':
        return ReportPeriod.day(now);
      case 'WEEK':
        return ReportPeriod.week(now);
      case 'MONTH':
        return ReportPeriod.month(now);
      case 'YEAR_TO_DATE':
        return ReportPeriod.yearToDate(now);
      case 'CUSTOM':
        return ReportPeriod.custom(start, end);
      default:
        return ReportPeriod.month(now);
    }
  }

  private static startOfDay(moment: Date): Date {
    return new Date(moment.getFullYear(), moment.getMonth(), moment.getDate());
  }

  includes(moment: Date): boolean {
    return this.range.contains(moment);
  }

  /** Total resource-hours a single resource could theoretically work in the window. */
  capacityHours(): number {
    return this.range.durationHours();
  }
}
