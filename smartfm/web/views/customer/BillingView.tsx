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
  formatDate,
  formatDateTime,
} from '../../components/Ui.tsx';
import type { ApiClient } from '../../api/ApiClient.ts';
import type { InvoiceView, PaymentOutcomeView, PaymentView, ReceiptView, ReferenceData } from '../../api/types.ts';

/**
 * Pay an invoice and receive a receipt (Assignment 1 Task 9).
 *
 * Settlement is simulated, as the Assignment 3 specification permits, and the
 * screen says so plainly rather than pretending otherwise. Both failure paths
 * are reachable on demand so they can be demonstrated:
 *
 *   card ending 0000 → declined  card ending 9999 → gateway timeout
 *   cash below the amount due  → refused with the shortfall explained
 */
export function BillingView(props: { api: ApiClient; reference: ReferenceData; refreshKey: number }): ReactNode {
  const [invoices, setInvoices] = useState<InvoiceView[]>([]);
  const [receipts, setReceipts] = useState<ReceiptView[]>([]);
  const [selected, setSelected] = useState<InvoiceView | undefined>(undefined);
  const [attempts, setAttempts] = useState<PaymentView[]>([]);
  const [outcome, setOutcome] = useState<PaymentOutcomeView | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const [method, setMethod] = useState<'CARD' | 'CASH'>('CARD');
  const [card, setCard] = useState({ cardHolder: '', lastFourDigits: '', expiryMonth: '12', expiryYear: '2030' });
  const [cash, setCash] = useState({ branchId: '', cashierName: '', amountTendered: '' });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  async function load(): Promise<void> {
    setLoading(true);
    try {
      const [foundInvoices, foundReceipts] = await Promise.all([props.api.invoices(), props.api.receipts()]);
      setInvoices(foundInvoices as unknown as InvoiceView[]);
      setReceipts(foundReceipts as unknown as ReceiptView[]);
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

  async function open(invoice: InvoiceView): Promise<void> {
    setSelected(invoice);
    setOutcome(undefined);
    setError(undefined);
    setFormErrors({});
    setCash((previous) => ({ ...previous, amountTendered: String(invoice.total.amount) }));
    try {
      setAttempts((await props.api.paymentAttempts(invoice.id)) as unknown as PaymentView[]);
    } catch {
      setAttempts([]);
    }
  }

  function validate(): boolean {
    const found: Record<string, string> = {};
    if (method === 'CARD') {
      if (card.cardHolder.trim().length < 2) {
        found['cardHolder'] = 'Enter the name printed on the card.';
      }
      if (!/^\d{4}$/.test(card.lastFourDigits)) {
        found['lastFourDigits'] = 'Enter exactly the last 4 digits of the card.';
      }
      const month = Number(card.expiryMonth);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        found['expiryMonth'] = 'Enter a month between 1 and 12.';
      }
      const year = Number(card.expiryYear);
      const thisYear = new Date().getFullYear();
      if (!Number.isInteger(year) || year < thisYear || year > thisYear + 15) {
        found['expiryYear'] = `Enter a year between ${thisYear} and ${thisYear + 15}.`;
      }
    } else {
      if (cash.branchId === '') {
        found['branchId'] = 'Choose the branch where the cash was handed over.';
      }
      if (cash.cashierName.trim().length < 2) {
        found['cashierName'] = 'Enter the name of the staff member who received it.';
      }
      if (!(Number(cash.amountTendered) > 0)) {
        found['amountTendered'] = 'Enter the amount of cash tendered.';
      }
    }
    setFormErrors(found);
    return Object.keys(found).length === 0;
  }

  async function pay(): Promise<void> {
    if (selected === undefined || !validate()) {
      return;
    }
    setBusy(true);
    setError(undefined);
    setOutcome(undefined);
    try {
      const body =
        method === 'CARD'
          ? {
              method: 'CARD',
              card: {
                cardHolder: card.cardHolder.trim(),
                lastFourDigits: card.lastFourDigits,
                expiryMonth: Number(card.expiryMonth),
                expiryYear: Number(card.expiryYear),
              },
            }
          : {
              method: 'CASH',
              cash: {
                branchId: cash.branchId,
                cashierName: cash.cashierName.trim(),
                amountTendered: Number(cash.amountTendered),
              },
            };
      const response = (await props.api.payInvoice(selected.id, body)) as unknown as PaymentOutcomeView;
      setOutcome(response);
      await load();
      const refreshed = (await props.api.invoices()) as unknown as InvoiceView[];
      setSelected(refreshed.find((invoice) => invoice.id === selected.id));
      setAttempts((await props.api.paymentAttempts(selected.id)) as unknown as PaymentView[]);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  if (loading && invoices.length === 0) {
    return <p className="muted">Loading your billing information…</p>;
  }

  const outstanding = invoices.filter((invoice) => invoice.isOutstanding);

  return (
    <>
      <div className="page-head">
        <h1>Billing</h1>
        <p>
          Invoices are issued when your branch dispatches a shipment. Pay by card or record a cash payment made at a
          branch counter.
        </p>
      </div>

      <Banner kind="info" title="Payment is simulated in this build">
        As permitted by the assignment specification, no banking system is contacted and no funds move. Every response
        message begins with <span className="mono">SIMULATED</span>. To see the failure paths, use a card ending{' '}
        <span className="mono">0000</span> (declined) or <span className="mono">9999</span> (gateway timeout).
      </Banner>

      <ErrorBanner error={error} />

      {invoices.length === 0 ? (
        <EmptyState title="You have no invoices yet">
          <p>An invoice appears here as soon as one of your orders is dispatched.</p>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Issued</th>
                <th>Due</th>
                <th>Total</th>
                <th>Status</th>
                <th>Attempts</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="mono">{invoice.invoiceNumber}</td>
                  <td>{formatDate(invoice.issuedAt)}</td>
                  <td>{formatDate(invoice.dueAt)}</td>
                  <td>{invoice.total.formatted}</td>
                  <td>
                    <StatusBadge status={invoice.status} />
                    {invoice.isOverdue ? <span className="badge danger" style={{ marginLeft: 6 }}>Overdue</span> : null}
                  </td>
                  <td>{invoice.attemptCount}</td>
                  <td>
                    <button className="btn small secondary" type="button" onClick={() => void open(invoice)}>
                      {invoice.isOutstanding ? 'Pay' : 'View'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {outstanding.length > 0 && selected === undefined ? (
        <Banner kind="warn" title={`${outstanding.length} invoice(s) outstanding`}>
          Select an invoice above to settle it.
        </Banner>
      ) : null}

      {selected !== undefined ? (
        <div className="grid two" style={{ marginTop: 16 }}>
          <Card title={`Invoice ${selected.invoiceNumber}`} hint={`Order ${selected.orderId}`}>
            <div className="table-wrap" style={{ marginBottom: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="right">Qty</th>
                    <th className="right">Unit price</th>
                    <th className="right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines.map((line, index) => (
                    <tr key={index}>
                      <td className="wrap">{line.description}</td>
                      <td className="right">{line.quantity.toLocaleString('en-US')}</td>
                      <td className="right">{line.unitPrice.formatted}</td>
                      <td className="right">{line.lineTotal.formatted}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className="right">
                      <strong>Total</strong>
                    </td>
                    <td className="right">
                      <strong>{selected.total.formatted}</strong>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {attempts.length > 0 ? (
              <>
                <h3>Payment attempts</h3>
                <p className="hint">Every attempt is kept, successful or not.</p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Method</th>
                        <th>Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((attempt) => (
                        <tr key={attempt.id}>
                          <td>{formatDateTime(attempt.attemptedAt)}</td>
                          <td className="wrap">{attempt.methodDescription}</td>
                          <td>
                            <StatusBadge
                              status={attempt.succeeded ? 'SETTLED' : 'FAILED_DELIVERY'}
                              label={attempt.outcome.replace(/_/g, ' ')}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </Card>

          <Card title={selected.isOutstanding ? 'Pay this invoice' : 'This invoice is settled'}>
            {outcome !== undefined ? (
              <Banner kind={outcome.succeeded ? 'success' : 'error'} title={outcome.succeeded ? 'Payment confirmed' : 'Payment not completed'}>
                {outcome.message}
                {!outcome.succeeded && outcome.retryable ? <div style={{ marginTop: 6 }}>You can try again below.</div> : null}
              </Banner>
            ) : null}

            {outcome?.receipt != null ? (
              <>
                <h3>Receipt {outcome.receipt.receiptNumber}</h3>
                <pre className="doc">{outcome.receipt.rendered}</pre>
              </>
            ) : null}

            {selected.isOutstanding ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void pay();
                }}
                noValidate
              >
                <Select
                  label="Payment method"
                  name="method"
                  value={method}
                  required
                  options={[
                    { value: 'CARD', label: 'Card (online)' },
                    { value: 'CASH', label: 'Cash at a branch counter' },
                  ]}
                  placeholder="Choose how to pay"
                  onChange={(value) => {
                    setMethod(value === 'CASH' ? 'CASH' : 'CARD');
                    setFormErrors({});
                  }}
                />

                {method === 'CARD' ? (
                  <fieldset>
                    <legend>Card details</legend>
                    <p className="hint">
                      Only the last four digits are collected — a full card number is never entered, transmitted or
                      stored anywhere in SmartFM.
                    </p>
                    <Field
                      label="Name on card"
                      name="cardHolder"
                      value={card.cardHolder}
                      required
                      error={formErrors['cardHolder']}
                      onChange={(value) => setCard((p) => ({ ...p, cardHolder: value }))}
                    />
                    <Field
                      label="Last 4 digits"
                      name="lastFourDigits"
                      value={card.lastFourDigits}
                      required
                      placeholder="4242"
                      help="Use 0000 to demonstrate a decline, or 9999 for a gateway timeout."
                      error={formErrors['lastFourDigits']}
                      onChange={(value) => setCard((p) => ({ ...p, lastFourDigits: value.replace(/\D/g, '').slice(0, 4) }))}
                    />
                    <div className="grid two">
                      <Field
                        label="Expiry month"
                        name="expiryMonth"
                        type="number"
                        min={1}
                        max={12}
                        value={card.expiryMonth}
                        required
                        error={formErrors['expiryMonth']}
                        onChange={(value) => setCard((p) => ({ ...p, expiryMonth: value }))}
                      />
                      <Field
                        label="Expiry year"
                        name="expiryYear"
                        type="number"
                        value={card.expiryYear}
                        required
                        error={formErrors['expiryYear']}
                        onChange={(value) => setCard((p) => ({ ...p, expiryYear: value }))}
                      />
                    </div>
                  </fieldset>
                ) : (
                  <fieldset>
                    <legend>Cash received at a branch</legend>
                    <Select
                      label="Branch"
                      name="branchId"
                      value={cash.branchId}
                      required
                      options={props.reference.branches.map((branch) => ({ value: branch.id, label: branch.label }))}
                      error={formErrors['branchId']}
                      onChange={(value) => setCash((p) => ({ ...p, branchId: value }))}
                    />
                    <Field
                      label="Received by (staff name)"
                      name="cashierName"
                      value={cash.cashierName}
                      required
                      error={formErrors['cashierName']}
                      onChange={(value) => setCash((p) => ({ ...p, cashierName: value }))}
                    />
                    <Field
                      label="Amount tendered (VND)"
                      name="amountTendered"
                      type="number"
                      min={0}
                      value={cash.amountTendered}
                      required
                      help={`The amount due is ${selected.total.formatted}. Tendering less is refused.`}
                      error={formErrors['amountTendered']}
                      onChange={(value) => setCash((p) => ({ ...p, amountTendered: value }))}
                    />
                  </fieldset>
                )}

                <div className="row">
                  <button className="btn" type="submit" disabled={busy}>
                    {busy ? 'Processing…' : `Pay ${selected.total.formatted}`}
                  </button>
                  <button className="btn quiet" type="button" onClick={() => setSelected(undefined)}>
                    Not now
                  </button>
                </div>
              </form>
            ) : (
              <>
                <Banner kind="success">This invoice has been settled in full. No further payment is required.</Banner>
                <button className="btn quiet" type="button" onClick={() => setSelected(undefined)}>
                  Close
                </button>
              </>
            )}
          </Card>
        </div>
      ) : null}

      <Card title="Receipts" hint="Proof of every settled invoice. Receipts can never be altered once issued.">
        {receipts.length === 0 ? (
          <p className="muted">No receipts yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Paid</th>
                  <th>Amount</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((receipt) => (
                  <tr key={receipt.id}>
                    <td className="mono">{receipt.receiptNumber}</td>
                    <td>{formatDateTime(receipt.paidAt)}</td>
                    <td>{receipt.amount.formatted}</td>
                    <td className="wrap">{receipt.methodDescription}</td>
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
