import type { ChangeEvent, ReactNode } from 'react';
import { ApiError } from '../api/ApiClient.ts';

interface FieldProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  help?: string | undefined;
  type?: 'text' | 'number' | 'email' | 'tel' | 'password' | 'date' | 'datetime-local';
  required?: boolean;
  placeholder?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  disabled?: boolean;
}

/** A labelled input that shows its own validation message underneath. */
export function Field(props: FieldProps): ReactNode {
  const invalid = props.error !== undefined && props.error !== '';
  return (
    <div className={invalid ? 'field invalid' : 'field'}>
      <label htmlFor={props.name}>
        {props.label}
        {props.required === true ? <span className="required" aria-hidden="true">*</span> : null}
      </label>
      <input
        id={props.name}
        name={props.name}
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder ?? ''}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${props.name}-error` : undefined}
        disabled={props.disabled === true}
        min={props.min}
        max={props.max}
        step={props.step}
        onChange={(event: ChangeEvent<HTMLInputElement>) => props.onChange(event.target.value)}
      />
      {invalid ? (
        <span className="error" id={`${props.name}-error`} role="alert">
          {props.error}
        </span>
      ) : props.help !== undefined ? (
        <span className="help">{props.help}</span>
      ) : null}
    </div>
  );
}

interface SelectProps {
  label: string;
  name: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  error?: string | undefined;
  help?: string | undefined;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

/** A labelled drop-down whose options always come from the server's reference data. */
export function Select(props: SelectProps): ReactNode {
  const invalid = props.error !== undefined && props.error !== '';
  return (
    <div className={invalid ? 'field invalid' : 'field'}>
      <label htmlFor={props.name}>
        {props.label}
        {props.required === true ? <span className="required" aria-hidden="true">*</span> : null}
      </label>
      <select
        id={props.name}
        name={props.name}
        value={props.value}
        aria-invalid={invalid}
        disabled={props.disabled === true}
        onChange={(event: ChangeEvent<HTMLSelectElement>) => props.onChange(event.target.value)}
      >
        <option value="">{props.placeholder ?? 'Please choose…'}</option>
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {invalid ? (
        <span className="error" role="alert">
          {props.error}
        </span>
      ) : props.help !== undefined ? (
        <span className="help">{props.help}</span>
      ) : null}
    </div>
  );
}

interface TextAreaProps {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  help?: string | undefined;
  rows?: number;
  required?: boolean;
  placeholder?: string;
}

export function TextArea(props: TextAreaProps): ReactNode {
  const invalid = props.error !== undefined && props.error !== '';
  return (
    <div className={invalid ? 'field invalid' : 'field'}>
      <label htmlFor={props.name}>
        {props.label}
        {props.required === true ? <span className="required" aria-hidden="true">*</span> : null}
      </label>
      <textarea
        id={props.name}
        name={props.name}
        rows={props.rows ?? 3}
        value={props.value}
        placeholder={props.placeholder ?? ''}
        aria-invalid={invalid}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => props.onChange(event.target.value)}
      />
      {invalid ? (
        <span className="error" role="alert">
          {props.error}
        </span>
      ) : props.help !== undefined ? (
        <span className="help">{props.help}</span>
      ) : null}
    </div>
  );
}

/** A page-level message. Field-level problems are listed so nothing is hidden. */
export function Banner(props: { kind: 'error' | 'success' | 'info' | 'warn'; title?: string; children?: ReactNode }): ReactNode {
  return (
    <div className={`banner ${props.kind}`} role={props.kind === 'error' ? 'alert' : 'status'}>
      {props.title !== undefined ? <strong>{props.title}</strong> : null}
      {props.children}
    </div>
  );
}

/** Renders an `ApiError` including every field message the server reported. */
export function ErrorBanner(props: { error: unknown }): ReactNode {
  if (props.error === undefined || props.error === null) {
    return null;
  }
  const error = props.error;
  if (error instanceof ApiError) {
    const fields = Object.entries(error.fieldErrors);
    return (
      <Banner kind="error" title={ErrorBanner.titleFor(error)}>
        <span>{error.message}</span>
        {fields.length > 1 ? (
          <ul>
            {fields.map(([field, message]) => (
              <li key={field}>
                <span className="mono">{field}</span>: {message}
              </li>
            ))}
          </ul>
        ) : null}
      </Banner>
    );
  }
  return <Banner kind="error" title="Something went wrong">{String(error)}</Banner>;
}

ErrorBanner.titleFor = (error: ApiError): string => {
  switch (error.code) {
    case 'VALIDATION_FAILED':
      return 'Please correct the highlighted fields';
    case 'RULE_VIOLATION':
      return 'This action is not allowed';
    case 'CONFLICT':
      return 'Someone got there first';
    case 'NOT_FOUND':
      return 'Not found';
    case 'NOT_AUTHORISED':
      return 'Not permitted';
    case 'NETWORK':
      return 'Cannot reach the server';
    default:
      return 'Request failed';
  }
};

/** A shown-when-nothing-exists placeholder — the "empty UI" state. */
export function EmptyState(props: { title: string; children?: ReactNode }): ReactNode {
  return (
    <div className="empty">
      <h3>{props.title}</h3>
      {props.children}
    </div>
  );
}

const BADGE_TONES: Readonly<Record<string, string>> = {
  PENDING: 'warn',
  ACCEPTED: 'info',
  DISPATCHED: 'info',
  IN_TRANSIT: 'info',
  DELIVERED: 'ok',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  FAILED_DELIVERY: 'danger',
  AVAILABLE: 'ok',
  ASSIGNED: 'info',
  IN_MAINTENANCE: 'warn',
  OUT_OF_SERVICE: 'danger',
  RETIRED: 'neutral',
  ON_LEAVE: 'warn',
  INACTIVE: 'neutral',
  OUTSTANDING: 'warn',
  SETTLED: 'ok',
  REFUNDED: 'neutral',
  VOID: 'neutral',
  ACTIVE: 'ok',
  PLANNED: 'info',
  COMPLETED: 'ok',
  PENDING_VERIFICATION: 'warn',
  CLOSED: 'neutral',
};

/** One consistent visual language for every status in the system. */
export function StatusBadge(props: { status: string; label?: string }): ReactNode {
  const tone = BADGE_TONES[props.status] ?? 'neutral';
  return <span className={`badge ${tone}`}>{props.label ?? props.status.replace(/_/g, ' ')}</span>;
}

export function Card(props: { title?: string; hint?: string; children: ReactNode; footer?: ReactNode }): ReactNode {
  return (
    <section className="card">
      {props.title !== undefined ? <h2>{props.title}</h2> : null}
      {props.hint !== undefined ? <p className="hint">{props.hint}</p> : null}
      {props.children}
      {props.footer}
    </section>
  );
}

export function Stat(props: { label: string; value: string; sub?: string }): ReactNode {
  return (
    <div className="stat">
      <div className="label">{props.label}</div>
      <div className="value">{props.value}</div>
      {props.sub !== undefined ? <div className="sub">{props.sub}</div> : null}
    </div>
  );
}

/** Formats an ISO timestamp for display; the server always sends ISO. */
export function formatDateTime(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === '') {
    return '—';
  }
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Converts an ISO timestamp into the value a datetime-local input expects. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
