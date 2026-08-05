import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Banner, Card, EmptyState, ErrorBanner, Field, Select, StatusBadge, formatDate } from '../../components/Ui.tsx';
import type { ApiClient } from '../../api/ApiClient.ts';
import { ApiError } from '../../api/ApiClient.ts';
import type { ReferenceData, VehicleView } from '../../api/types.ts';

/**
 * Business area 2, first half — manage vehicle information (Assignment 1 Task 1).
 *
 * All five subtasks are on this one screen: add a vehicle, update its details,
 * change its operational status, search the list, and retire it. Retirement is a
 * soft delete and is refused while the vehicle is on an active itinerary
 * (variant 5a), the refusal comes from `Vehicle.retire()` itself, so the
 * message shown here is the domain's own words.
 */
export function FleetView(props: { api: ApiClient; reference: ReferenceData; refreshKey: number }): ReactNode {
  const [vehicles, setVehicles] = useState<VehicleView[]>([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState<unknown>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [maintenanceFor, setMaintenanceFor] = useState<VehicleView | undefined>(undefined);

  const [form, setForm] = useState({ registration: '', type: '', odometerKm: '0' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [maintenance, setMaintenance] = useState({ description: '', expectedReturn: '' });
  const [maintenanceError, setMaintenanceError] = useState<string | undefined>(undefined);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      setVehicles((await props.api.vehicles()) as unknown as VehicleView[]);
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
    if (!/^\d{2}[A-Za-z]{1,2}-\d{3}\.?\d{2}$/.test(form.registration.trim().replace(/\s+/g, ''))) {
      found['registration'] = 'Use a Vietnamese plate format, for example 51C-123.45.';
    }
    if (form.type === '') {
      found['type'] = 'Choose the vehicle type.';
    }
    if (Number(form.odometerKm) < 0 || !Number.isFinite(Number(form.odometerKm))) {
      found['odometerKm'] = 'Enter the current odometer reading in kilometres.';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function addVehicle(): Promise<void> {
    setError(undefined);
    setNotice(undefined);
    if (!validate()) {
      return;
    }
    setBusy(true);
    try {
      const created = (await props.api.createVehicle({
        registration: form.registration.trim(),
        type: form.type,
        odometerKm: Number(form.odometerKm),
      })) as unknown as VehicleView;
      setNotice(`Vehicle ${created.registration} was added to the fleet.`);
      setForm({ registration: '', type: '', odometerKm: '0' });
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

  async function submitMaintenance(): Promise<void> {
    if (maintenanceFor === undefined) {
      return;
    }
    if (maintenance.description.trim().length < 3) {
      setMaintenanceError('Describe the work being done (at least 3 characters).');
      return;
    }
    setMaintenanceError(undefined);
    await act(
      () =>
        props.api.sendVehicleToMaintenance(maintenanceFor.id, {
          description: maintenance.description.trim(),
          expectedReturn: maintenance.expectedReturn === '' ? undefined : new Date(maintenance.expectedReturn).toISOString(),
        }),
      `${maintenanceFor.registration} was booked into maintenance and is no longer offered to customers.`,
    );
    setMaintenanceFor(undefined);
    setMaintenance({ description: '', expectedReturn: '' });
  }

  const visible = vehicles.filter((vehicle) => {
    const matchesText =
      filter === '' ||
      vehicle.registration.toLowerCase().includes(filter.toLowerCase()) ||
      vehicle.type.toLowerCase().includes(filter.toLowerCase());
    const matchesStatus = statusFilter === '' || vehicle.status === statusFilter;
    return matchesText && matchesStatus;
  });

  if (loading && vehicles.length === 0) {
    return <p className="muted">Loading the fleet…</p>;
  }

  return (
    <>
      <div className="page-head">
        <h1>Fleet</h1>
        <p>
          Register vehicles, keep their details and operational status current, book maintenance, and retire vehicles
          that leave service. Records are never deleted — history is preserved.
        </p>
      </div>

      {notice !== undefined ? <Banner kind="success">{notice}</Banner> : null}
      <ErrorBanner error={error} />

      <Card>
        <div className="row">
          <div style={{ flex: 1, minWidth: 220 }}>
            <Field
              label="Search by plate or type"
              name="filter"
              value={filter}
              placeholder="e.g. 51C or TRUCK"
              onChange={setFilter}
            />
          </div>
          <div style={{ minWidth: 200 }}>
            <Select
              label="Filter by status"
              name="statusFilter"
              value={statusFilter}
              placeholder="All statuses"
              options={['AVAILABLE', 'ASSIGNED', 'IN_MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED'].map((value) => ({
                value,
                label: value.replace(/_/g, ' '),
              }))}
              onChange={setStatusFilter}
            />
          </div>
          <button className="btn" type="button" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Close' : 'Add a vehicle'}
          </button>
        </div>

        {showAdd ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void addVehicle();
            }}
            noValidate
          >
            <fieldset>
              <legend>New vehicle</legend>
              <div className="grid three">
                <Field
                  label="Registration"
                  name="registration"
                  value={form.registration}
                  required
                  placeholder="51C-123.45"
                  help="Vietnamese plate format."
                  error={errors['registration']}
                  onChange={(value) => {
                    setForm((p) => ({ ...p, registration: value }));
                    setErrors((p) => ({ ...p, registration: '' }));
                  }}
                />
                <Select
                  label="Type"
                  name="type"
                  value={form.type}
                  required
                  options={props.reference.vehicleTypes.map((value) => ({ value, label: value.replace(/_/g, ' ') }))}
                  help="Type fixes the capacity and the licence class required."
                  error={errors['type']}
                  onChange={(value) => {
                    setForm((p) => ({ ...p, type: value }));
                    setErrors((p) => ({ ...p, type: '' }));
                  }}
                />
                <Field
                  label="Odometer (km)"
                  name="odometerKm"
                  type="number"
                  min={0}
                  value={form.odometerKm}
                  error={errors['odometerKm']}
                  onChange={(value) => {
                    setForm((p) => ({ ...p, odometerKm: value }));
                    setErrors((p) => ({ ...p, odometerKm: '' }));
                  }}
                />
              </div>
              <div className="row">
                <button className="btn" type="submit" disabled={busy}>
                  Add vehicle
                </button>
                <button
                  className="btn quiet"
                  type="button"
                  onClick={() => {
                    setForm({ registration: '', type: '', odometerKm: '0' });
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
        <EmptyState title="No vehicles match your search">
          <p>Clear the filters, or add a vehicle to this branch.</p>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Registration</th>
                <th>Type</th>
                <th>Capacity</th>
                <th>Licence</th>
                <th>Status</th>
                <th>Odometer</th>
                <th>Available from</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td className="mono">{vehicle.registration}</td>
                  <td>
                    {vehicle.type.replace(/_/g, ' ')}
                    {vehicle.isRefrigerated ? <span className="badge info" style={{ marginLeft: 6 }}>Reefer</span> : null}
                  </td>
                  <td>
                    {vehicle.maxWeightKg.toLocaleString('en-US')} kg / {vehicle.maxVolumeM3} m³
                  </td>
                  <td>{vehicle.requiredLicenceClass}</td>
                  <td>
                    <StatusBadge status={vehicle.status} />
                  </td>
                  <td>{vehicle.odometerKm.toLocaleString('en-US')} km</td>
                  <td>{vehicle.availableFrom === null ? '—' : formatDate(vehicle.availableFrom)}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {vehicle.status === 'AVAILABLE' ? (
                        <button
                          className="btn small quiet"
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setMaintenanceFor(vehicle);
                            setMaintenanceError(undefined);
                          }}
                        >
                          Maintenance
                        </button>
                      ) : null}
                      {vehicle.status === 'IN_MAINTENANCE' || vehicle.status === 'OUT_OF_SERVICE' ? (
                        <button
                          className="btn small secondary"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () => props.api.returnVehicleToService(vehicle.id),
                              `${vehicle.registration} is back in service.`,
                            )
                          }
                        >
                          Return to service
                        </button>
                      ) : null}
                      {vehicle.status !== 'RETIRED' ? (
                        <button
                          className="btn small danger"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void act(() => props.api.retireVehicle(vehicle.id), `${vehicle.registration} was retired.`)
                          }
                        >
                          Retire
                        </button>
                      ) : (
                        <button
                          className="btn small quiet"
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              () => props.api.reinstateVehicle(vehicle.id),
                              `${vehicle.registration} was reinstated.`,
                            )
                          }
                        >
                          Reinstate
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

      {maintenanceFor !== undefined ? (
        <Card title={`Book ${maintenanceFor.registration} into maintenance`}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitMaintenance();
            }}
            noValidate
          >
            <Field
              label="What work is being done?"
              name="maintenanceDescription"
              value={maintenance.description}
              required
              placeholder="e.g. Scheduled brake service"
              error={maintenanceError}
              onChange={(value) => {
                setMaintenance((p) => ({ ...p, description: value }));
                setMaintenanceError(undefined);
              }}
            />
            <Field
              label="Expected return to service (optional)"
              name="expectedReturn"
              type="date"
              value={maintenance.expectedReturn}
              help="Published to the availability search so customers see the earliest date it is free."
              onChange={(value) => setMaintenance((p) => ({ ...p, expectedReturn: value }))}
            />
            <div className="row">
              <button className="btn" type="submit" disabled={busy}>
                Book maintenance
              </button>
              <button className="btn quiet" type="button" onClick={() => setMaintenanceFor(undefined)}>
                Cancel
              </button>
            </div>
          </form>
        </Card>
      ) : null}
    </>
  );
}
