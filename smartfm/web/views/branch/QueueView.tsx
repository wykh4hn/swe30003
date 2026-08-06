import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Banner,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  StatusBadge,
  TextArea,
  formatDateTime,
} from '../../components/Ui.tsx';
import type { ApiClient } from '../../api/ApiClient.ts';
import type { AssignmentSuggestionView, InvoiceView, OrderReviewView, OrderView } from '../../api/types.ts';

/**
 * Process and dispatch incoming orders
 *
 * The branch console walks the four subtasks in order: pick an order off the
 * queue, review the verification report, decide, then assign resources and
 * dispatch. The report separates *problems* (which block acceptance) from
 * *warnings* (which do not) — the distinction that makes variant 3b, a possible
 * duplicate, actionable rather than obstructive.
 */
export function QueueView(props: { api: ApiClient; staffName: string; refreshKey: number; onChanged: () => void }): ReactNode {
  const [queue, setQueue] = useState<OrderView[]>([]);
  const [allOrders, setAllOrders] = useState<OrderView[]>([]);
  const [selected, setSelected] = useState<OrderView | undefined>(undefined);
  const [review, setReview] = useState<OrderReviewView | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<AssignmentSuggestionView[]>([]);
  const [chosenPairs, setChosenPairs] = useState<string[]>([]);
  const [invoice, setInvoice] = useState<InvoiceView | undefined>(undefined);
  const [staffName, setStaffName] = useState(props.staffName);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState<string | undefined>(undefined);
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const [pending, everything] = await Promise.all([props.api.branchQueue(), props.api.branchOrders()]);
      setQueue(pending as unknown as OrderView[]);
      setAllOrders(everything as unknown as OrderView[]);
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
    setReview(undefined);
    setSuggestions([]);
    setChosenPairs([]);
    setInvoice(undefined);
    setShowReject(false);
    setRejectReason('');
    setNotice(undefined);
    setError(undefined);
    try {
      if (order.status === 'PENDING') {
        setReview((await props.api.reviewOrder(order.id)) as unknown as OrderReviewView);
      }
      if (order.status === 'ACCEPTED') {
        setSuggestions((await props.api.assignmentSuggestions(order.id)) as unknown as AssignmentSuggestionView[]);
      }
    } catch (caught) {
      setError(caught);
    }
  }

  async function refreshSelected(orderId: string): Promise<void> {
    const everything = (await props.api.branchOrders()) as unknown as OrderView[];
    setAllOrders(everything);
    setQueue((await props.api.branchQueue()) as unknown as OrderView[]);
    const refreshed = everything.find((order) => order.id === orderId);
    setSelected(refreshed);
    if (refreshed?.status === 'ACCEPTED') {
      setSuggestions((await props.api.assignmentSuggestions(orderId)) as unknown as AssignmentSuggestionView[]);
    }
    props.onChanged();
  }

  async function accept(): Promise<void> {
    if (selected === undefined) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await props.api.acceptOrder(selected.id, staffName);
      setNotice(`Order ${selected.reference} accepted. Assign a vehicle and driver below.`);
      setReview(undefined);
      await refreshSelected(selected.id);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function reject(): Promise<void> {
    if (selected === undefined) {
      return;
    }
    if (rejectReason.trim().length < 5) {
      setRejectError('Give a reason of at least 5 characters — it is sent to the customer and kept on the record.');
      return;
    }
    setRejectError(undefined);
    setBusy(true);
    setError(undefined);
    try {
      await props.api.rejectOrder(selected.id, staffName, rejectReason.trim());
      setNotice(`Order ${selected.reference} was rejected and the customer was told why.`);
      setShowReject(false);
      await refreshSelected(selected.id);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function assign(): Promise<void> {
    if (selected === undefined || chosenPairs.length === 0) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const assignments = chosenPairs
        .map((key) => suggestions.find((suggestion) => `${suggestion.vehicleId}|${suggestion.driverId}` === key))
        .filter((suggestion): suggestion is AssignmentSuggestionView => suggestion !== undefined)
        .map((suggestion) => ({ vehicleId: suggestion.vehicleId, driverId: suggestion.driverId }));

      await props.api.assignResources(selected.id, assignments, staffName);
      setNotice(`${assignments.length} itinerary/itineraries created. The order is ready to dispatch.`);
      setChosenPairs([]);
      await refreshSelected(selected.id);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function dispatch(): Promise<void> {
    if (selected === undefined) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const response = (await props.api.dispatchOrder(selected.id, staffName)) as unknown as {
        order: OrderView;
        invoice: InvoiceView | null;
      };
      setNotice(`Order ${response.order.reference} dispatched and invoiced.`);
      setInvoice(response.invoice ?? undefined);
      await refreshSelected(selected.id);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  function togglePair(key: string): void {
    setChosenPairs((previous) =>
      previous.includes(key) ? previous.filter((entry) => entry !== key) : [...previous, key],
    );
  }

  if (loading && allOrders.length === 0) {
    return <p className="muted">Loading the branch queue…</p>;
  }

  const chosenCapacity = chosenPairs
    .map((key) => suggestions.find((suggestion) => `${suggestion.vehicleId}|${suggestion.driverId}` === key))
    .reduce((total, suggestion) => total + (suggestion?.capacityKg ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <h1>Order queue</h1>
        <p>Review incoming orders, accept or reject them with a recorded reason, then assign resources and dispatch.</p>
      </div>

      {notice !== undefined ? <Banner kind="success">{notice}</Banner> : null}
      <ErrorBanner error={error} />

      <Card title={`Pending review (${queue.length})`} hint="Oldest first — these orders are waiting on you.">
        {queue.length === 0 ? (
          <EmptyState title="Nothing waiting">
            <p>Every order in your queue has been processed.</p>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Placed</th>
                  <th>Route</th>
                  <th>Cargo</th>
                  <th>Deliver by</th>
                  <th>Quote</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {queue.map((order) => (
                  <tr key={order.id}>
                    <td className="mono">{order.reference}</td>
                    <td>{formatDateTime(order.placedAt)}</td>
                    <td>{order.delivery.summary}</td>
                    <td className="wrap">{order.cargo.summary}</td>
                    <td>{formatDateTime(order.delivery.requiredDeliveryBy)}</td>
                    <td>{order.quotedPrice.formatted}</td>
                    <td>
                      <button className="btn small" type="button" onClick={() => void open(order)}>
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected !== undefined ? (
        <Card title={`Order ${selected.reference}`} hint={`${selected.delivery.summary} · ${selected.statusLabel}`}>
          <div className="row" style={{ marginBottom: 12 }}>
            <StatusBadge status={selected.status} label={selected.statusLabel} />
            {selected.isSplitShipment ? <span className="badge info">Split shipment</span> : null}
          </div>

          <Field
            label="Your name (recorded against this decision)"
            name="staffName"
            value={staffName}
            required
            help="The audit trail records who accepted, rejected, assigned or dispatched."
            onChange={setStaffName}
          />

          {/* --------------------------------------------- verification report */}
          {review !== undefined ? (
            <>
              <h3>Verification report</h3>
              <p className="small">
                <strong>Customer:</strong> {review.customerName}
                <br />
                <strong>Cargo:</strong> {review.cargoSummary}
                <br />
                <strong>Addresses:</strong> {review.deliverySummary}
                <br />
                <strong>Planned route:</strong> {review.routeLabel}
                <br />
                <strong>Quote:</strong> {review.quoteFormatted}
              </p>

              {review.problems.length > 0 ? (
                <Banner kind="error" title="These problems block acceptance">
                  <ul>
                    {review.problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </Banner>
              ) : (
                <Banner kind="success">All checks passed. This order can be accepted.</Banner>
              )}

              {review.warnings.length > 0 ? (
                <Banner kind="warn" title="Check these before accepting">
                  <ul>
                    {review.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </Banner>
              ) : null}

              <div className="row">
                <button className="btn" type="button" disabled={busy || !review.canAccept} onClick={() => void accept()}>
                  Accept order
                </button>
                <button className="btn danger" type="button" onClick={() => setShowReject(!showReject)}>
                  Reject order
                </button>
              </div>

              {showReject ? (
                <form
                  style={{ marginTop: 12 }}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void reject();
                  }}
                  noValidate
                >
                  <TextArea
                    label="Reason for rejection"
                    name="rejectReason"
                    value={rejectReason}
                    required
                    rows={2}
                    error={rejectError}
                    help="Sent to the customer and stored permanently on the order."
                    onChange={(value) => {
                      setRejectReason(value);
                      setRejectError(undefined);
                    }}
                  />
                  <div className="row">
                    <button className="btn danger" type="submit" disabled={busy}>
                      Confirm rejection
                    </button>
                    <button className="btn quiet" type="button" onClick={() => setShowReject(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          ) : null}

          {/* ------------------------------------------------ resource assignment */}
          {selected.status === 'ACCEPTED' ? (
            <>
              <h3>Assign vehicles and drivers</h3>
              <p className="hint">
                Only legal pairings are listed: the driver's licence covers the vehicle, and neither is already
                committed during this delivery window. This shipment needs{' '}
                <strong>{selected.cargo.totalWeightKg.toLocaleString('en-US')} kg</strong> of capacity.
              </p>

              {suggestions.length === 0 ? (
                <Banner kind="warn">
                  No vehicle and driver pairing is free for this window. Free up a resource or reschedule.
                </Banner>
              ) : (
                <>
                  <div className="table-wrap" style={{ marginBottom: 12 }}>
                    <table>
                      <thead>
                        <tr>
                          <th />
                          <th>Vehicle</th>
                          <th>Capacity</th>
                          <th>Driver</th>
                          <th>Licence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suggestions.map((suggestion) => {
                          const key = `${suggestion.vehicleId}|${suggestion.driverId}`;
                          return (
                            <tr key={key}>
                              <td>
                                <input
                                  type="checkbox"
                                  aria-label={`Assign ${suggestion.vehicleLabel} with ${suggestion.driverName}`}
                                  checked={chosenPairs.includes(key)}
                                  onChange={() => togglePair(key)}
                                />
                              </td>
                              <td>{suggestion.vehicleLabel}</td>
                              <td>{suggestion.capacityKg.toLocaleString('en-US')} kg</td>
                              <td>{suggestion.driverName}</td>
                              <td>{suggestion.driverLicenceClass}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <p className="small muted">
                    Selected capacity: <strong>{chosenCapacity.toLocaleString('en-US')} kg</strong> of{' '}
                    {selected.cargo.totalWeightKg.toLocaleString('en-US')} kg required.
                    {chosenCapacity > 0 && chosenCapacity < selected.cargo.totalWeightKg
                      ? ' Select another vehicle to cover the shortfall.'
                      : ''}
                  </p>

                  <div className="row">
                    <button className="btn" type="button" disabled={busy || chosenPairs.length === 0} onClick={() => void assign()}>
                      Assign {chosenPairs.length > 0 ? `${chosenPairs.length} vehicle(s)` : ''}
                    </button>
                    <button className="btn quiet" type="button" onClick={() => setChosenPairs([])}>
                      Clear selection
                    </button>
                  </div>
                </>
              )}

              {selected.itineraryIds.length > 0 ? (
                <div style={{ marginTop: 14 }}>
                  <Banner kind="success" title={`${selected.itineraryIds.length} itinerary/itineraries assigned`}>
                    The order is ready to leave the branch.
                  </Banner>
                  <button className="btn" type="button" disabled={busy} onClick={() => void dispatch()}>
                    Dispatch and issue the invoice
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          {invoice !== undefined ? (
            <>
              <h3 style={{ marginTop: 18 }}>Invoice issued</h3>
              <pre className="doc">{invoice.rendered}</pre>
            </>
          ) : null}

          <h3 style={{ marginTop: 18 }}>Audit trail</h3>
          <pre className="doc">{selected.history.map((entry) => entry.formatted).join('\n') || 'No changes yet.'}</pre>
        </Card>
      ) : null}

      <Card title={`All orders at this branch (${allOrders.length})`} hint="Every order this branch has handled.">
        {allOrders.length === 0 ? (
          <EmptyState title="No orders yet">
            <p>Orders placed by customers against this branch will appear here.</p>
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Status</th>
                  <th>Route</th>
                  <th>Placed</th>
                  <th>Quote</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {allOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="mono">{order.reference}</td>
                    <td>
                      <StatusBadge status={order.status} label={order.statusLabel} />
                    </td>
                    <td>{order.delivery.summary}</td>
                    <td>{formatDateTime(order.placedAt)}</td>
                    <td>{order.quotedPrice.formatted}</td>
                    <td>
                      <button className="btn small secondary" type="button" onClick={() => void open(order)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
