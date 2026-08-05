import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Banner, Card, ErrorBanner, Field, Select, StatusBadge, formatDateTime } from '../../components/Ui.tsx';
import type { ApiClient } from '../../api/ApiClient.ts';
import type { CustomerView, NotificationView, ReferenceData } from '../../api/types.ts';

/**
 * Business area 1 — the customer's own account (Assignment 1 Task 3, subtasks 4-5).
 *
 * The closure button demonstrates variant 5a directly: the server refuses while
 * open orders or unpaid invoices exist, and the reason is shown verbatim. The
 * notification panel shows that the Observer pattern (change C17) is actually
 * firing rather than merely declared.
 */
export function ProfileView(props: {
  api: ApiClient;
  reference: ReferenceData;
  profile: CustomerView;
  onProfileChanged: (customer: CustomerView) => void;
  onSignedOut: () => void;
  refreshKey: number;
}): ReactNode {
  const [form, setForm] = useState({
    fullName: props.profile.fullName,
    companyName: props.profile.companyName ?? '',
    email: props.profile.contact.email,
    phone: props.profile.contact.phone,
    street: props.profile.billingAddress.street,
    district: props.profile.billingAddress.district,
    city: props.profile.billingAddress.city,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [notifications, setNotifications] = useState<NotificationView[]>([]);
  const [confirmClose, setConfirmClose] = useState(false);

  async function loadNotifications(): Promise<void> {
    try {
      setNotifications((await props.api.notifications()) as unknown as NotificationView[]);
    } catch {
      setNotifications([]);
    }
  }

  useEffect(() => {
    void loadNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.refreshKey]);

  function set(field: keyof typeof form, value: string): void {
    setForm((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: '' }));
  }

  function validate(): boolean {
    const found: Record<string, string> = {};
    if (form.fullName.trim().length < 2) {
      found['fullName'] = 'Enter your full name.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      found['email'] = 'Enter a valid email address.';
    }
    if (!/^\+?\d{8,15}$/.test(form.phone.replace(/[\s.-]/g, ''))) {
      found['phone'] = 'Enter 8-15 digits.';
    }
    if (form.street.trim().length < 3) {
      found['street'] = 'Enter the street address.';
    }
    if (form.district.trim().length < 2) {
      found['district'] = 'Enter the district.';
    }
    if (form.city === '') {
      found['city'] = 'Choose a city.';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function save(): Promise<void> {
    setError(undefined);
    setNotice(undefined);
    if (!validate()) {
      return;
    }
    setBusy(true);
    try {
      const updated = (await props.api.updateProfile({
        fullName: form.fullName.trim(),
        companyName: form.companyName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        billingAddress: { street: form.street.trim(), district: form.district.trim(), city: form.city },
      })) as unknown as CustomerView;
      props.onProfileChanged(updated);
      setNotice('Your details were saved.');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  function reset(): void {
    setForm({
      fullName: props.profile.fullName,
      companyName: props.profile.companyName ?? '',
      email: props.profile.contact.email,
      phone: props.profile.contact.phone,
      street: props.profile.billingAddress.street,
      district: props.profile.billingAddress.district,
      city: props.profile.billingAddress.city,
    });
    setErrors({});
    setNotice('Your changes were discarded.');
  }

  async function toggleNotifications(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      const updated = (await props.api.setNotifications(!props.profile.notificationsEnabled)) as unknown as CustomerView;
      props.onProfileChanged(updated);
      setNotice(updated.notificationsEnabled ? 'Status notifications are on.' : 'Status notifications are off.');
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function close(): Promise<void> {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await props.api.closeAccount();
      props.onSignedOut();
    } catch (caught) {
      setError(caught);
      setConfirmClose(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>My account</h1>
        <p>Keep your contact and billing details up to date so orders, invoices and shipment history stay correct.</p>
      </div>

      {notice !== undefined ? <Banner kind="success">{notice}</Banner> : null}
      <ErrorBanner error={error} />

      <div className="grid two">
        <Card title="Your details">
          <p className="small muted">
            Account status <StatusBadge status={props.profile.accountStatus} /> · registered{' '}
            {formatDateTime(props.profile.registeredAt)}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
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
              label="Company"
              name="companyName"
              value={form.companyName}
              error={errors['companyName']}
              onChange={(value) => set('companyName', value)}
            />
            <Field
              label="Email address"
              name="email"
              type="email"
              value={form.email}
              required
              help="Changing this also changes your sign-in name."
              error={errors['email']}
              onChange={(value) => set('email', value)}
            />
            <Field
              label="Phone"
              name="phone"
              type="tel"
              value={form.phone}
              required
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
                options={props.reference.cities.map((city) => ({ value: city, label: city }))}
                error={errors['city']}
                onChange={(value) => set('city', value)}
              />
            </fieldset>
            <div className="row">
              <button className="btn" type="submit" disabled={busy}>
                Save changes
              </button>
              <button className="btn quiet" type="button" onClick={reset}>
                Discard changes
              </button>
            </div>
          </form>
        </Card>

        <div>
          <Card title="Shipment notifications" hint="Opt in or out of status messages about your shipments.">
            <p className="small">
              Notifications are currently{' '}
              <strong>{props.profile.notificationsEnabled ? 'switched on' : 'switched off'}</strong>.
            </p>
            <button className="btn secondary" type="button" disabled={busy} onClick={() => void toggleNotifications()}>
              {props.profile.notificationsEnabled ? 'Turn notifications off' : 'Turn notifications on'}
            </button>

            <h3 style={{ marginTop: 18 }}>Recent messages</h3>
            {notifications.length === 0 ? (
              <p className="muted small">
                No messages yet. Place an order and messages will appear as it moves through the system.
              </p>
            ) : (
              <ul className="timeline">
                {notifications.map((message, index) => (
                  <li key={index}>
                    <div className="when">
                      {formatDateTime(message.raisedAt)} · <span className="mono">{message.orderReference}</span>
                    </div>
                    <div className="what">{message.message}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Close my account">
            <p className="small">
              Closing your account keeps your order history for ABC-Trans' records but prevents new orders. It is
              refused while you still have live orders or unpaid invoices.
            </p>
            {confirmClose ? (
              <>
                <Banner kind="warn" title="Are you sure?">
                  This signs you out and disables ordering.
                </Banner>
                <div className="row">
                  <button className="btn danger" type="button" disabled={busy} onClick={() => void close()}>
                    Yes, close my account
                  </button>
                  <button className="btn quiet" type="button" onClick={() => setConfirmClose(false)}>
                    No, keep it open
                  </button>
                </div>
              </>
            ) : (
              <button className="btn danger" type="button" onClick={() => setConfirmClose(true)}>
                Close my account
              </button>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
