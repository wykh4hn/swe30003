import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Banner, Card, EmptyState, ErrorBanner, Field, Select, StatusBadge, formatDate } from '../../components/Ui.tsx';
import type { ApiClient } from '../../api/ApiClient.ts';
import { ApiError } from '../../api/ApiClient.ts';
import type { DriverView, ReferenceData } from '../../api/types.ts';

/**
 * Business area 2, second half — manage driver information (Assignment 1 Task 2).
 *
 * Registering a driver also creates their sign-in account, so a newly added
 * driver can immediately use the driver view — the dependency between this
 * business area and shipment tracking is real, not stubbed.
 *
 * Deactivation is refused while an itinerary is open (variant 3a), and the
 * refusal is `Driver.assertCanDeactivate()` speaking, not a check in the UI.
 */
export function DriversView(props: { api: ApiClient; reference: ReferenceData; refreshKey: number }): ReactNode {
  const [drivers, setDrivers] = useState<DriverView[]>([]);
  const [filter, setFilter] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('');
  const [error, setError] = useState<unknown>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [leaveFor, setLeaveFor] = useState<DriverView | undefined>(undefined);

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    licenceNumber: '',
    licenceClass: '',
    password: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [leave, setLeave] = useState({ start: '', end: '' });
  const [leaveErrors, setLeaveErrors] = useState<Record<string, string>>({});

  async function load(): Promise<void> {
    setLoading(true);
    try {
      setDrivers((await props.api.drivers()) as unknown as DriverView[]);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.refreshKey]);

  function validate(): boolean {
    const found: Record<string, string> = {};
    if (form.fullName.trim().length < 2) {
      found['fullName'] = 'Enter the driver’s full name.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim())) {
      found['email'] = 'Enter a valid email address — it becomes their sign-in name.';
    }
    if (!/^\+?\d{8,15}$/.test(form.phone.replace(/[\s.-]/g, ''))) {
      found['phone'] = 'Enter 8-15 digits.';
    }
    if (form.licenceNumber.trim().length < 6) {
      found['licenceNumber'] = 'Enter the licence number (at least 6 characters).';
    }
    if (form.licenceClass === '') {
      found['licenceClass'] = 'Choose the licence class.';
    }
    if (form.password !== '' && form.password.length < 8) {
      found['password'] = 'A password must be at least 8 characters, or leave blank for the default.';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function addDriver(): Promise<void> {
    setError(undefined);
    setNotice(undefined);
    if (!validate()) {
      return;
    }
    setBusy(true);
    try {
      const created = (await props.api.createDriver({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        licenceNumber: form.licenceNumber.trim(),
        licenceClass: form.licenceClass,
        ...(form.password === '' ? {} : { password: form.password }),
      })) as unknown as DriverView;
      setNotice(
        `${created.fullName} was added and can sign in as ${created.contact.email} with the password ${
          form.password === '' ? 'driver1234' : 'you set'
        }.`,
      );
      setForm({ fullName: '', email: '', phone: '', licenceNumber: '', licenceClass: '', password: '' });
      setShowAdd(false);
      await load();
    } catch (caught) {
      setError(caught);
      if (caught instanceof ApiError) {
        setErrors(caught.fieldErrors);
      }
    } finally {
      setBusy(false);
    }
  }

  async function act(action: () => Promise<unknown>, message: string): Promise<void> {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
      setNotice(message);
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function submitLeave(): Promise<void> {
    if (leaveFor === undefined) {
      return;
    }
    const found: Record<string, string> = {};
    if (leave.start === '') {
      found['start'] = 'Choose the first day of leave.';
    }
    if (leave.end === '') {
      found['end'] = 'Choose the return date.';
    }
    if (leave.start !== '' && leave.end !== '' && new Date(leave.end) <= new Date(leave.start)) {
      found['end'] = 'The return date must be after the first day of leave.';
    }
    setLeaveErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }
    await act(
      () =>
        props.api.recordDriverLeave(leaveFor.id, {
          start: new Date(leave.start).toISOString(),
          end: new Date(leave.end).toISOString(),
        }),
      `${leaveFor.fullName} is on leave and will not be offered for assignment.`,
    );
    setLeaveFor(undefined);
    setLeave({ start: '', end: '' });
  }

  const visible = drivers.filter((driver) => {
    const matchesText =
      filter === '' ||
      driver.fullName.toLowerCase().includes(filter.toLowerCase()) ||
      driver.licenceNumber.toLowerCase().includes(filter.toLowerCase());
    const matchesAvailability = availabilityFilter === '' || driver.availability === availabilityFilter;
    return matchesText && matchesAvailability;
  });

  if (loading && drivers.length === 0) {
    return <p className="muted">Loading drivers…</p>;
  }

  return (
    <>
      <div className="page-head">
        <h1>Drivers</h1>
        <p>
          Maintain driver records, qualifications and availability. A driver's licence class decides which vehicles they
          may be assigned to.
        </p>
      </div>

      {notice !== undefined ? <Banner kind="success">{notice}</Banner> : null}
      <ErrorBanner error={error} />

      <Card>
        <div className="row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <Field label="Search by name or licence" name="filter" value={filter} onChange={setFilter} />
          </div>
          <div style={{ minWidth: 200 }}>
            <Select
              label="Filter by availability"
              name="availabilityFilter"
              value={availabilityFilter}
              placeholder="All"
              options={['AVAILABLE', 'ASSIGNED', 'ON_LEAVE', 'INACTIVE'].map((value) => ({
                value,
                label: value.replace(/_/g, ' '),
              }))}
              onChange={setAvailabilityFilter}
            />
          </div>
          <button className="btn" type="button" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Close' : 'Add a driver'}
          </button>
        </div>

        {showAdd ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void addDriver();
            }}
            noValidate
          >
            <fieldset>
              <legend>New driver</legend>
              <div className="grid two">
                <Field
                  label="Full name"
                  name="fullName"
                  value={form.fullName}
                  required
                  error={errors['fullName']}
                  onChange={(value) => {
                    setForm((p) => ({ ...p, fullName: value }));
                    setErrors((p) => ({ ...p, fullName: '' }));
                  }}
                />
                <Field
                  label="Email address"
                  name="email"
                  type="email"
                  value={form.email}
                  required
                  help="Becomes their sign-in name for the driver view."
                  error={errors['email']}
                  onChange={(value) => {
                    setForm((p) => ({ ...p, email: value }));
                    setErrors((p) => ({ ...p, email: '' }));
                  }}
                />
                <Field
                  label="Phone"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  required
                  error={errors['phone']}
                  onChange={(value) => {
                    setForm((p) => ({ ...p, phone: value }));
                    setErrors((p) => ({ ...p, phone: '' }));
                  }}
                />
                <Field
                  label="Licence number"
                  name="licenceNumber"
                  value={form.licenceNumber}
                  required
                  error={errors['licenceNumber']}
                  onChange={(value) => {
                    setForm((p) => ({ ...p, licenceNumber: value }));
                    setErrors((p) => ({ ...p, licenceNumber: '' }));
                  }}
                />
                <Select
                  label="Licence class"
                  name="licenceClass"
                  value={form.licenceClass}
                  required
                  options={props.reference.licenceClasses.map((value) => ({ value, label: `Class ${value}` }))}
                  help="Class FC is required for a 20ft container; class C for trucks."
                  error={errors['licenceClass']}
                  onChange={(value) => {
                    setForm((p) => ({ ...p, licenceClass: value }));
                    setErrors((p) => ({ ...p, licenceClass: '' }));
                  }}
                />
                <Field
                  label="Initial password (optional)"
                  name="password"
                  type="password"
                  value={form.password}
                  help="Leave blank to use the default, driver1234."
                  error={errors['password']}
                  onChange={(value) => {
                    setForm((p) => ({ ...p, password: value }));
                    setErrors((p) => ({ ...p, password: '' }));
                  }}
                />
              </div>
              <div className="row">
                <button className="btn" type="submit" disabled={busy}>
                  Add driver
                </button>
                <button
                  className="btn quiet"
                  type="button"
                  onClick={() => {
                    setForm({ fullName: '', email: '', phone: '', licenceNumber: '', licenceClass: '', password: '' });
                    setErrors({});
                    setShowAdd(false);
                  }}
                >
                  Discard
                </button>
              </div>
            </fieldset>
          </form>
        ) : null}
      </Card>

      {visible.length === 0 ? (
        <EmptyState title="No drivers match your search">
          <p>Clear the filters, or add a driver to this branch.</p>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Licence</th>
                <th>Availability</th>
                <th>Leave</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((driver) => (
                <tr key={driver.id}>
                  <td>{driver.fullName}</td>
                  <td className="wrap small">
                    {driver.contact.email}
                    <br />
                    {driver.contact.phone}
                  </td>
                  <td>
                    {driver.licenceClass} <span className="muted small">({driver.licenceNumber})</span>
                  </td>
                  <td>
                    <StatusBadge status={driver.availability} />
                  </td>
                  <td className="small">
                    {driver.leave === null
                      ? '—'
                      : `${formatDate(driver.leave.start)} to ${formatDate(driver.leave.end)}`}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {driver.availability === 'AVAILABLE' ? (
                        <button
                          className="btn small quiet"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setLeaveFor(driver);
                            setLeaveErrors({});
                          }}
                        >
                          Record leave
                        </button>
                      ) : null}
                      {driver.availability === 'ON_LEAVE' ? (
                        <button
                          className="btn small secondary"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void act(() => props.api.endDriverLeave(driver.id), `${driver.fullName} is back on duty.`)
                          }
                        >
                          End leave
                        </button>
                      ) : null}
                      {driver.isActive ? (
                        <button
                          className="btn small danger"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () => props.api.deactivateDriver(driver.id),
                              `${driver.fullName} was deactivated. Their history is retained.`,
                            )
                          }
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          className="btn small quiet"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () => props.api.reactivateDriver(driver.id),
                              `${driver.fullName} was reactivated.`,
                            )
                          }
                        >
                          Reactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {leaveFor !== undefined ? (
        <Card title={`Record leave for ${leaveFor.fullName}`}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitLeave();
            }}
            noValidate
          >
            <div className="grid two">
              <Field
                label="First day of leave"
                name="leaveStart"
                type="date"
                value={leave.start}
                required
                error={leaveErrors['start']}
                onChange={(value) => {
                  setLeave((p) => ({ ...p, start: value }));
                  setLeaveErrors((p) => ({ ...p, start: '' }));
                }}
              />
              <Field
                label="Returns on"
                name="leaveEnd"
                type="date"
                value={leave.end}
                required
                error={leaveErrors['end']}
                onChange={(value) => {
                  setLeave((p) => ({ ...p, end: value }));
                  setLeaveErrors((p) => ({ ...p, end: '' }));
                }}
              />
            </div>
            <div className="row">
              <button className="btn" type="submit" disabled={busy}>
                Record leave
              </button>
              <button className="btn quiet" type="button" onClick={() => setLeaveFor(undefined)}>
                Cancel
              </button>
            </div>
          </form>
        </Card>
      ) : null}
    </>
  );
}
