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
import type { OrderView, ReferenceData, TimelineView } from '../../api/types.ts';

/**
 * Business areas 3 and 6 for the customer — my orders, amendment, cancellation
 * and tracking (Assignment 1 Tasks 6 and 8).
 *
 * Which actions appear is driven entirely by the server's answer: `isModifiable`
 * comes from the published lifecycle table (change C15), so the interface can
 * never offer an action the domain would refuse. That is the practical payoff of
 * making the transition table explicit instead of leaving it in prose.
 */
export function MyOrdersView(props: { api: ApiClient; reference: ReferenceData; refreshKey: number }): ReactNode {
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [selected, setSelected] = useState<OrderView | undefined>(undefined);
  const [timeline, setTimeline] = useState<TimelineView | undefined>(undefined);
  const [panel, setPanel] = useState<'NONE' | 'AMEND' | 'CANCEL'>('NONE');
  const [error, setError] = useState<unknown>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [amend, setAmend] = useState({ street: '', district: '', city: '', deliverBy: '', name: '', phone: '' });
  const [amendErrors, setAmendErrors] = useState<Record<string, string>>({});
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | undefined>(undefined);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const found = (await props.api.orders()) as unknown as OrderView[];
      setOrders(found);
      if (selected !== undefined) {
        const refreshed = found.find((order) => order.id === selected.id);
        setSelected(refreshed);
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

  async function open(order: OrderView): Promise<void> {
    setSelected(order);
    setPanel('NONE');
    setNotice(undefined);
    setError(undefined);
    setAmend({
      street: order.delivery.deliveryAddress.street,
      district: order.delivery.deliveryAddress.district,
      city: order.delivery.deliveryAddress.city,
      deliverBy: toLocalInput(order.delivery.requiredDeliveryBy),
      name: order.delivery.recipientName,
      phone: order.delivery.recipientPhone,
    });
    setAmendErrors({});
    try {
      setTimeline((await props.api.tracking(order.id)) as unknown as TimelineView);
    } catch {
      setTimeline(undefined);
    }
  }

  async function submitAmendment(): Promise<void> {
    if (selected === undefined) {
      return;
    }
    const found: Record<string, string> = {};
    if (amend.street.trim().length < 3) {
      found['street'] = 'Enter the street address.';
    }
    if (amend.district.trim().length < 2) {
      found['district'] = 'Enter the district.';
    }
    if (amend.city === '') {
      found['city'] = 'Choose the delivery city.';
    }
    if (new Date(amend.deliverBy).getTime() <= Date.now()) {
      found['deliverBy'] = 'The new deadline must be in the future.';
    }
    if (amend.name.trim().length < 2) {
      found['name'] = 'Enter the recipient name.';
    }
    if (!/^\+?\d{8,15}$/.test(amend.phone.replace(/[\s.-]/g, ''))) {
      found['phone'] = 'Enter a valid phone number (8-15 digits).';
    }
    setAmendErrors(found);
    if (Object.keys(found).length > 0) {
      return;
    }

    setBusy(true);
    setError(undefined);
    try {
      await props.api.amendOrder(selected.id, {
        deliveryAddress: { street: amend.street.trim(), district: amend.district.trim(), city: amend.city },
        requiredDeliveryBy: new Date(amend.deliverBy).toISOString(),
        recipientName: amend.name.trim(),
        recipientPhone: amend.phone.trim(),
      });
      setNotice('Your delivery details were updated and the order was re-priced where the route changed.');
      setPanel('NONE');
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function submitCancellation(): Promise<void> {
    if (selected === undefined) {
      return;
    }
    if (cancelReason.trim().length < 3) {
      setCancelError('Tell us briefly why you are cancelling (at least 3 characters).');
      return;
    }
    setCancelError(undefined);
    setBusy(true);
    setError(undefined);
    try {
      await props.api.cancelOrder(selected.id, cancelReason.trim());
      setNotice(`Order ${selected.reference} was cancelled and any reserved vehicles were released.`);
      setPanel('NONE');
      setCancelReason('');
      await load();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (loading && orders.length === 0) {
    return <p className="muted">Loading your orders…</p>;
  }

  return (
    <>
      <div className="page-head">
        <h1>My orders</h1>
        <p>Every shipment you have placed, with its live status, timeline and the actions still available to you.</p>
      </div>

      {notice !== undefined ? <Banner kind="success">{notice}</Banner> : null}
      <ErrorBanner error={error} />

      {orders.length === 0 ? (
        <EmptyState title="You have not placed any orders yet">
          <p>Use “Place an order” to book your first shipment. It will appear here as soon as it is submitted.</p>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Route</th>
                <th>Cargo</th>
                <th>Status</th>
                <th>Deliver by</th>
                <th>Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="mono">{order.reference}</td>
                  <td>{order.delivery.summary}</td>
                  <td className="wrap">{order.cargo.description}</td>
                  <td>
                    <StatusBadge status={order.status} label={order.statusLabel} />
                  </td>
                  <td>{formatDateTime(order.delivery.requiredDeliveryBy)}</td>
                  <td>{order.quotedPrice.formatted}</td>
                  <td>
                    <button className="btn small secondary" type="button" onClick={() => void open(order)}>
                      {selected?.id === order.id ? 'Viewing' : 'View'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected !== undefined ? (
        <div className="grid two" style={{ marginTop: 16 }}>
          <Card title={`Order ${selected.reference}`} hint={selected.delivery.summary}>
            <p className="small">
              <strong>Goods:</strong> {selected.cargo.summary}
              <br />
              <strong>Collect from:</strong> {selected.delivery.pickupAddress.formatted}
              <br />
              <strong>Deliver to:</strong> {selected.delivery.deliveryAddress.formatted}
              <br />
              <strong>Recipient:</strong> {selected.delivery.recipientName} ({selected.delivery.recipientPhone})
              <br />
              <strong>Placed:</strong> {formatDateTime(selected.placedAt)}
            </p>

            {selected.rejectionReason !== null ? (
              <Banner kind="error" title="This order was rejected">
                {selected.rejectionReason}
              </Banner>
            ) : null}

            {selected.isModifiable ? (
              <div className="row">
                <button className="btn secondary" type="button" onClick={() => setPanel(panel === 'AMEND' ? 'NONE' : 'AMEND')}>
                  Change delivery details
                </button>
                <button className="btn danger" type="button" onClick={() => setPanel(panel === 'CANCEL' ? 'NONE' : 'CANCEL')}>
                  Cancel this order
                </button>
              </div>
            ) : (
              <Banner kind="info">
                This order is {selected.statusLabel.toLowerCase()} and can no longer be changed or cancelled online.
                Contact your branch if you need help.
              </Banner>
            )}

            {panel === 'AMEND' ? (
              <form
                style={{ marginTop: 14 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitAmendment();
                }}
                noValidate
              >
                <fieldset>
                  <legend>Amend delivery details</legend>
                  <Field
                    label="Street"
                    name="amend-street"
                    value={amend.street}
                    required
                    error={amendErrors['street']}
                    onChange={(value) => setAmend((p) => ({ ...p, street: value }))}
                  />
                  <Field
                    label="District"
                    name="amend-district"
                    value={amend.district}
                    required
                    error={amendErrors['district']}
                    onChange={(value) => setAmend((p) => ({ ...p, district: value }))}
                  />
                  <Select
                    label="City"
                    name="amend-city"
                    value={amend.city}
                    required
                    options={props.reference.cities.map((city) => ({ value: city, label: city }))}
                    help="Changing the city re-prices the order."
                    error={amendErrors['city']}
                    onChange={(value) => setAmend((p) => ({ ...p, city: value }))}
                  />
                  <Field
                    label="Required delivery by"
                    name="amend-deliverBy"
                    type="datetime-local"
                    value={amend.deliverBy}
                    required
                    error={amendErrors['deliverBy']}
                    onChange={(value) => setAmend((p) => ({ ...p, deliverBy: value }))}
                  />
                  <Field
                    label="Recipient name"
                    name="amend-name"
                    value={amend.name}
                    required
                    error={amendErrors['name']}
                    onChange={(value) => setAmend((p) => ({ ...p, name: value }))}
                  />
                  <Field
                    label="Recipient phone"
                    name="amend-phone"
                    type="tel"
                    value={amend.phone}
                    required
                    error={amendErrors['phone']}
                    onChange={(value) => setAmend((p) => ({ ...p, phone: value }))}
                  />
                  <div className="row">
                    <button className="btn" type="submit" disabled={busy}>
                      Save changes
                    </button>
                    <button className="btn quiet" type="button" onClick={() => setPanel('NONE')}>
                      Discard changes
                    </button>
                  </div>
                </fieldset>
              </form>
            ) : null}

            {panel === 'CANCEL' ? (
              <form
                style={{ marginTop: 14 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitCancellation();
                }}
                noValidate
              >
                <fieldset>
                  <legend>Cancel order {selected.reference}</legend>
                  <TextArea
                    label="Why are you cancelling?"
                    name="cancelReason"
                    value={cancelReason}
                    required
                    rows={2}
                    error={cancelError}
                    help="The reason is recorded in the order's audit trail."
                    onChange={(value) => {
                      setCancelReason(value);
                      setCancelError(undefined);
                    }}
                  />
                  <div className="row">
                    <button className="btn danger" type="submit" disabled={busy}>
                      Confirm cancellation
                    </button>
                    <button className="btn quiet" type="button" onClick={() => setPanel('NONE')}>
                      Keep the order
                    </button>
                  </div>
                </fieldset>
              </form>
            ) : null}
          </Card>

          <Card title="Tracking" hint={timeline?.routeLabel ?? 'The route is planned once the branch accepts the order.'}>
            {timeline === undefined ? (
              <p className="muted">No tracking information yet.</p>
            ) : (
              <>
                <div className="row" style={{ marginBottom: 10 }}>
                  <StatusBadge status={selected.status} label={timeline.statusLabel} />
                  {timeline.isDelayed ? <span className="badge warn">Running late</span> : null}
                </div>
                <p className="small">{timeline.nextStep}</p>
                <p className="small muted">
                  <strong>Current ETA:</strong> {formatDateTime(timeline.currentEta)}
                </p>

                {timeline.entries.length === 0 ? (
                  <EmptyState title="No checkpoints yet">
                    <p className="small">
                      Checkpoints appear here as soon as the driver reports the first one after pickup.
                    </p>
                  </EmptyState>
                ) : (
                  <ul className="timeline">
                    {[...timeline.entries].reverse().map((entry, index) => (
                      <li
                        key={`${entry.recordedAt}-${index}`}
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
                        {entry.estimatedArrival !== null ? (
                          <div className="small muted">Revised ETA {formatDateTime(entry.estimatedArrival)}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            <h3 style={{ marginTop: 18 }}>Audit trail</h3>
            <p className="hint">Every change to this order, in the order it happened.</p>
            <pre className="doc">{selected.history.map((entry) => entry.formatted).join('\n') || 'No changes yet.'}</pre>
          </Card>
        </div>
      ) : null}
    </>
  );
}
