import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Banner,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Select,
  StatusBadge,
  TextArea,
  formatDateTime,
  toLocalInput,
} from '../../components/Ui.tsx';
import type { ApiClient } from '../../api/ApiClient.ts';
import type { DriverJobView, OrderView, ReferenceData } from '../../api/types.ts';

/**
 * Report progress from the road
 *
 * Deliberately the simplest screen in the system: a driver is using a phone in a
 * cab, so it shows the current job, four buttons for the common checkpoints, and
 * one place to revise the ETA.
 *
 * The rules behind it are not simple, and none of them live here. The order
 * decides whether this driver may post at all, whether the checkpoint is in
 * order, and what the checkpoint does to its lifecycle. Posting `Delivered`
 * completes the itinerary and returns the vehicle and driver to the pool.
 */
export function DriverJobsView(props: { api: ApiClient; reference: ReferenceData; refreshKey: number }): ReactNode {
  const [jobs, setJobs] = useState<DriverJobView[]>([]);
  const [selected, setSelected] = useState<DriverJobView | undefined>(undefined);
  const [state, setState] = useState('');
  const [locationLabel, setLocationLabel] = useState('');
  const [eta, setEta] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastOrder, setLastOrder] = useState<OrderView | undefined>(undefined);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const found = (await props.api.driverJobs()) as unknown as DriverJobView[];
      setJobs(found);
      if (selected !== undefined) {
        setSelected(found.find((job) => job.itineraryId === selected.itineraryId));
      }
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

  function choose(job: DriverJobView): void {
    setSelected(job);
    setState('');
    setLocationLabel('');
    setEta(toLocalInput(job.dueBy));
    setNote('');
    setErrors({});
    setNotice(undefined);
    setError(undefined);
    setLastOrder(undefined);
  }

  async function post(chosenState?: string): Promise<void> {
    if (selected === undefined) {
      return;
    }
    const effectiveState = chosenState ?? state;
    const found: Record<string, string> = {};
    if (effectiveState === '') {
      found['state'] = 'Choose what has happened.';
    }
    if (locationLabel.trim().length < 2) {
      found['locationLabel'] = 'Where are you? Enter a city or landmark.';
    }
    if ((effectiveState === 'DELAYED' || effectiveState === 'FAILED_ATTEMPT') && note.trim().length < 3) {
      found['note'] = 'Explain briefly what happened — this is shown to the customer.';
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const order = (await props.api.postDriverUpdate({
        itineraryId: selected.itineraryId,
        state: effectiveState,
        locationLabel: locationLabel.trim(),
        ...(eta === '' ? {} : { estimatedArrival: new Date(eta).toISOString() }),
        ...(note.trim() === '' ? {} : { note: note.trim() }),
      })) as unknown as OrderView;

      setLastOrder(order);
      setNotice(
        effectiveState === 'DELIVERED'
          ? `Delivery of ${order.reference} confirmed. Your vehicle is back in the pool.`
          : `Checkpoint recorded for ${order.reference}. The customer can see it now.`,
      );
      setState('');
      setNote('');
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (loading && jobs.length === 0) {
    return <p className="muted">Loading your jobs…</p>;
  }

  return (
    <>
      <div className="page-head">
        <h1>My jobs</h1>
        <p>Report progress as you go. Each checkpoint is added to the customer's timeline and can never be edited.</p>
      </div>

      {notice !== undefined ? <Banner kind="success">{notice}</Banner> : null}
      <ErrorBanner error={error} />

      {jobs.length === 0 ? (
        <EmptyState title="You have no jobs at the moment">
          <p>Your branch will assign you a vehicle and a shipment. It will appear here as soon as it is dispatched.</p>
        </EmptyState>
      ) : (
        <div className="grid two">
          {jobs.map((job) => (
            <section
              key={job.itineraryId}
              className={selected?.itineraryId === job.itineraryId ? 'card selectable selected' : 'card selectable'}
              onClick={() => choose(job)}
            >
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h3 className="mono">{job.orderReference}</h3>
                <StatusBadge status={job.status} />
              </div>
              <p className="small">
                <strong>Vehicle:</strong> {job.vehicleLabel}
                <br />
                <strong>Load:</strong> {job.cargoSummary}
                <br />
                <strong>Collect:</strong> {job.pickup}
                <br />
                <strong>Deliver:</strong> {job.destination}
                <br />
                <strong>Due by:</strong> {formatDateTime(job.dueBy)}
              </p>
              <button className="btn small" type="button" onClick={() => choose(job)}>
                {selected?.itineraryId === job.itineraryId ? 'Selected' : 'Report on this job'}
              </button>
            </section>
          ))}
        </div>
      )}

      {selected !== undefined ? (
        <Card title={`Report progress — ${selected.orderReference}`} hint={`${selected.pickup} → ${selected.destination}`}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void post();
            }}
            noValidate
          >
            <Field
              label="Where are you now?"
              name="locationLabel"
              value={locationLabel}
              required
              placeholder="e.g. Nha Trang"
              help="A city or a recognisable landmark is enough."
              error={errors['locationLabel']}
              onChange={(value) => {
                setLocationLabel(value);
                setErrors((p) => ({ ...p, locationLabel: '' }));
              }}
            />
            <Field
              label="Revised arrival time"
              name="eta"
              type="datetime-local"
              value={eta}
              help="Leave as-is if you are still on schedule."
              onChange={setEta}
            />

            <h3>Quick checkpoints</h3>
            <p className="hint">One tap for the four common events.</p>
            <div className="row">
              {[
                { value: 'PICKED_UP', label: 'Picked up' },
                { value: 'IN_TRANSIT', label: 'On the road' },
                { value: 'AT_HUB', label: 'At a hub' },
                { value: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
              ].map((option) => (
                <button
                  key={option.value}
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => void post(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 16 }}>
              <Select
                label="Or report something else"
                name="state"
                value={state}
                options={props.reference.trackingStates.map((value) => ({
                  value,
                  label: value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()),
                }))}
                placeholder="Choose an event"
                error={errors['state']}
                onChange={(value) => {
                  setState(value);
                  setErrors((p) => ({ ...p, state: '' }));
                }}
              />
              <TextArea
                label="Note"
                name="note"
                value={note}
                rows={2}
                placeholder="e.g. Highway closure on QL1A"
                help="Required when reporting a delay or a failed attempt. Shown to the customer."
                error={errors['note']}
                onChange={(value) => {
                  setNote(value);
                  setErrors((p) => ({ ...p, note: '' }));
                }}
              />
              <div className="row">
                <button className="btn" type="submit" disabled={busy}>
                  Send checkpoint
                </button>
                <button
                  className="btn danger"
                  type="button"
                  disabled={busy}
                  onClick={() => void post('DELIVERED')}
                >
                  Confirm delivery
                </button>
                <button className="btn quiet" type="button" onClick={() => setSelected(undefined)}>
                  Close
                </button>
              </div>
            </div>
          </form>

          {lastOrder !== undefined ? (
            <>
              <h3 style={{ marginTop: 18 }}>Timeline so far</h3>
              <ul className="timeline">
                {[...lastOrder.tracking].reverse().map((entry) => (
                  <li
                    key={entry.id}
                    className={
                      entry.state === 'DELIVERED'
                        ? 'done'
                        : entry.state === 'DELAYED'
                          ? 'delayed'
                          : entry.state === 'FAILED_ATTEMPT'
                            ? 'failed'
                            : ''
                    }
                  >
                    <div className="when">{formatDateTime(entry.recordedAt)}</div>
                    <div className="what">{entry.description}</div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
