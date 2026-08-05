import { useState } from 'react';
import type { ReactNode } from 'react';
import { ErrorBanner, Field, Select } from '../components/Ui.tsx';
import type { ApiClient } from '../api/ApiClient.ts';
import { ApiError } from '../api/ApiClient.ts';
import type { ReferenceData } from '../api/types.ts';

/**
 * Customer self-registration
 *
 * The form validates in the browser as the user types *and* shows whatever the
 * server rejects, mapped back onto the field that caused it. Nothing relies on
 * client-side checking alone: the server's `Guard` is the authority, and the
 * duplicate-email rule (variant 1a) can only be enforced there.
 */
export function RegisterView(props: {
  api: ApiClient;
  reference: ReferenceData | undefined;
  onRegistered: (email: string) => void;
  onCancel: () => void;
}): ReactNode {
  const [form, setForm] = useState({
    fullName: '',
    companyName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    street: '',
    district: '',
    city: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(undefined);
  const [busy, setBusy] = useState(false);

  function set(field: keyof typeof form, value: string): void {
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: '' }));
  }

  function validate(): boolean {
    const found: Record<string, string> = {};
    if (form.fullName.trim().length < 2) {
      found['fullName'] = 'Enter your full name (at least 2 characters).';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      found['email'] = 'Enter a valid email address, e.g. name@example.com.';
    }
    if (!/^\+?\d{8,15}$/.test(form.phone.replace(/[\s.-]/g, ''))) {
      found['phone'] = 'Enter 8-15 digits, optionally starting with +.';
    }
    if (form.password.length < 8) {
      found['password'] = 'Choose a password of at least 8 characters.';
    }
    if (form.confirmPassword !== form.password) {
      found['confirmPassword'] = 'The two passwords do not match.';
    }
    if (form.street.trim().length < 3) {
      found['street'] = 'Enter the street address.';
    }
    if (form.district.trim().length < 2) {
      found['district'] = 'Enter the district.';
    }
    if (form.city === '') {
      found['city'] = 'Choose the billing city.';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function submit(): Promise<void> {
    setError(undefined);
    if (!validate()) {
      return;
    }
    setBusy(true);
    try {
      await props.api.register({
        fullName: form.fullName.trim(),
        companyName: form.companyName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        billingAddress: { street: form.street.trim(), district: form.district.trim(), city: form.city },
      });
      props.onRegistered(form.email.trim());
    } catch (caught) {
      setError(caught);
      if (caught instanceof ApiError) {
        // Map server field names (e.g. "billingAddress.street") onto form fields.
        const mapped: Record<string, string> = {};
        for (const [field, message] of Object.entries(caught.fieldErrors)) {
          mapped[field.split('.').pop() ?? field] = message;
        }
        setErrors(mapped);
      }
    } finally {
      setBusy(false);
    }
  }

  const cityOptions = (props.reference?.cities ?? []).map((city) => ({ value: city, label: city }));

  return (
    <>
      <h2>Create a customer account</h2>
      <p className="hint">
        Registration takes about a minute. Your contact details are verified immediately in this demonstration build.
      </p>

      <ErrorBanner error={error} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        noValidate
      >
        <Field
          label="Full name"
          name="fullName"
          value={form.fullName}
          required
          error={errors['fullName']}
          onChange={(value) => set('fullName', value)}
        />
        <Field
          label="Company (optional)"
          name="companyName"
          value={form.companyName}
          help="Leave blank if you are ordering as an individual."
          error={errors['companyName']}
          onChange={(value) => set('companyName', value)}
        />
        <Field
          label="Email address"
          name="email"
          type="email"
          value={form.email}
          required
          help="This becomes your sign-in name."
          error={errors['email']}
          onChange={(value) => set('email', value)}
        />
        <Field
          label="Phone number"
          name="phone"
          type="tel"
          value={form.phone}
          required
          placeholder="0987111222"
          error={errors['phone']}
          onChange={(value) => set('phone', value)}
        />

        <fieldset>
          <legend>Billing address</legend>
          <Field
            label="Street"
            name="street"
            value={form.street}
            required
            error={errors['street']}
            onChange={(value) => set('street', value)}
          />
          <Field
            label="District"
            name="district"
            value={form.district}
            required
            error={errors['district']}
            onChange={(value) => set('district', value)}
          />
          <Select
            label="City"
            name="city"
            value={form.city}
            required
            options={cityOptions}
            help="ABC-Trans serves these cities."
            error={errors['city']}
            onChange={(value) => set('city', value)}
          />
        </fieldset>

        <Field
          label="Password"
          name="password"
          type="password"
          value={form.password}
          required
          help="At least 8 characters."
          error={errors['password']}
          onChange={(value) => set('password', value)}
        />
        <Field
          label="Confirm password"
          name="confirmPassword"
          type="password"
          value={form.confirmPassword}
          required
          error={errors['confirmPassword']}
          onChange={(value) => set('confirmPassword', value)}
        />

        <div className="row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
          <button className="btn quiet" type="button" onClick={props.onCancel}>
            Back to sign in
          </button>
        </div>
      </form>
    </>
  );
}
