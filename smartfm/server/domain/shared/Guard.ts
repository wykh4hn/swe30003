import { ValidationError, ValidationSummaryError } from './DomainError.ts';

/**
 * Input-validation helper used by constructors and mutators throughout the
 * domain layer.
 *
 * Assignment 1 required real-time validation of every user input (SRS §9.2,
 * design-level requirement) and Assignment 3 is marked on rejecting incorrect
 * input. Centralising the checks here means every entry point — REST call,
 * self-test, seed loader — enforces exactly the same rules, so validation
 * cannot be bypassed by reaching an object through a different route.
 */
export class Guard {
  private constructor() {
    // Static utility; never instantiated.
  }

  /** Non-blank text within a length range. */
  static text(field: string, value: unknown, min = 1, max = 200): string {
    if (typeof value !== 'string') {
      throw new ValidationError(field, `${field} must be text.`);
    }
    const trimmed = value.trim();
    if (trimmed.length < min) {
      throw new ValidationError(
        field,
        min === 1 ? `${field} cannot be blank.` : `${field} must be at least ${min} characters.`,
      );
    }
    if (trimmed.length > max) {
      throw new ValidationError(field, `${field} cannot exceed ${max} characters.`);
    }
    return trimmed;
  }

  /** Optional text: blank/undefined becomes undefined, anything else is validated. */
  static optionalText(field: string, value: unknown, max = 200): string | undefined {
    if (value === undefined || value === null || String(value).trim() === '') {
      return undefined;
    }
    return Guard.text(field, value, 1, max);
  }

  /** A finite number inside an inclusive range. */
  static number(field: string, value: unknown, min: number, max: number): number {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      throw new ValidationError(field, `${field} must be a number.`);
    }
    if (parsed < min || parsed > max) {
      throw new ValidationError(field, `${field} must be between ${min} and ${max}.`);
    }
    return parsed;
  }

  /** A number strictly greater than zero. */
  static positive(field: string, value: unknown, max = Number.MAX_SAFE_INTEGER): number {
    const parsed = Guard.number(field, value, Number.MIN_SAFE_INTEGER, max);
    if (parsed <= 0) {
      throw new ValidationError(field, `${field} must be greater than zero.`);
    }
    return parsed;
  }

  /** A whole number strictly greater than zero. */
  static positiveInteger(field: string, value: unknown, max = Number.MAX_SAFE_INTEGER): number {
    const parsed = Guard.positive(field, value, max);
    if (!Number.isInteger(parsed)) {
      throw new ValidationError(field, `${field} must be a whole number.`);
    }
    return parsed;
  }

  /** Membership of a closed set of allowed literals. */
  static oneOf<T extends string>(field: string, value: unknown, allowed: readonly T[]): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
      throw new ValidationError(field, `${field} must be one of: ${allowed.join(', ')}.`);
    }
    return value as T;
  }

  /** A syntactically plausible email address. */
  static email(field: string, value: unknown): string {
    const text = Guard.text(field, value, 5, 120).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) {
      throw new ValidationError(field, `${field} must be a valid email address, e.g. name@example.com.`);
    }
    return text;
  }

  /** A Vietnamese-style phone number: 8-15 digits, optional leading '+'. */
  static phone(field: string, value: unknown): string {
    const text = Guard.text(field, value, 8, 20);
    const compact = text.replace(/[\s.-]/g, '');
    if (!/^\+?\d{8,15}$/.test(compact)) {
      throw new ValidationError(field, `${field} must be 8-15 digits, optionally starting with '+'.`);
    }
    return compact;
  }

  /** An ISO-8601 date string or Date, returned as a Date. */
  static date(field: string, value: unknown): Date {
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      throw new ValidationError(field, `${field} must be a valid date.`);
    }
    return parsed;
  }

  /** A date that is not in the past relative to `now`. */
  static futureDate(field: string, value: unknown, now: Date): Date {
    const parsed = Guard.date(field, value);
    if (parsed.getTime() < now.getTime()) {
      throw new ValidationError(field, `${field} cannot be in the past.`);
    }
    return parsed;
  }

  /** `later` must be strictly after `earlier`. */
  static after(field: string, later: Date, earlier: Date, earlierLabel: string): Date {
    if (later.getTime() <= earlier.getTime()) {
      throw new ValidationError(field, `${field} must be after ${earlierLabel}.`);
    }
    return later;
  }

  /** Asserts a business rule that is not tied to a single input field. */
  static require(condition: boolean, field: string, message: string): void {
    if (!condition) {
      throw new ValidationError(field, message);
    }
  }

  /**
   * Runs several checks and reports every failure at once.
   *
   * Assignment 1's usability attribute asks for a customer to complete an order
   * without external help; showing one error at a time makes that far harder,
   * so form-level input is collected through this method.
   */
  static collect<T>(checks: readonly (() => void)[], produce: () => T): T {
    const errors: ValidationError[] = [];
    for (const check of checks) {
      try {
        check();
      } catch (error) {
        if (error instanceof ValidationError) {
          errors.push(error);
        } else {
          throw error;
        }
      }
    }
    if (errors.length > 0) {
      throw new ValidationSummaryError(errors);
    }
    return produce();
  }
}
