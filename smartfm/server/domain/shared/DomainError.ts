/**
 * Domain error hierarchy.
 *
 * Introduced in the Assignment 3 detailed design (change C18). The Assignment 2
 * design described alternate/error paths in prose only; an implementation needs
 * a first-class way for a domain object to refuse an operation without knowing
 * anything about HTTP, the user interface or the persistence mechanism.
 *
 * The API layer is the only place that translates these into transport codes,
 * which keeps the domain layer free of presentation concerns.
 */
export abstract class DomainError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, string>>;

  protected constructor(code: string, message: string, details: Record<string, string> = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

/** A supplied value is missing, malformed or out of range. */
export class ValidationError extends DomainError {
  readonly field: string;

  constructor(field: string, message: string) {
    super('VALIDATION_FAILED', message, { field });
    this.field = field;
  }
}

/** Several field-level problems reported together, so a form can show them all at once. */
export class ValidationSummaryError extends DomainError {
  readonly errors: readonly ValidationError[];

  constructor(errors: readonly ValidationError[]) {
    const summary = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    super('VALIDATION_FAILED', summary || 'One or more fields are invalid.');
    this.errors = errors;
  }
}

/** A referenced object does not exist. */
export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} '${id}' was not found.`, { entity, id });
  }
}

/** The request was well formed but a business rule forbids it. */
export class RuleViolationError extends DomainError {
  constructor(message: string, details: Record<string, string> = {}) {
    super('RULE_VIOLATION', message, details);
  }
}

/** The operation clashed with concurrent state, e.g. capacity already taken. */
export class ConflictError extends DomainError {
  constructor(message: string, details: Record<string, string> = {}) {
    super('CONFLICT', message, details);
  }
}

/** The caller is not permitted to see or change the target object. */
export class AuthorisationError extends DomainError {
  constructor(message = 'You are not authorised to perform this action.') {
    super('NOT_AUTHORISED', message);
  }
}
