import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Banner, Card, EmptyState, ErrorBanner, Field, Select, Stat, formatDateTime } from '../../components/Ui.tsx';
import type { ApiClient } from '../../api/ApiClient.ts';
import type { ResourceReportView, ShipmentReportView } from '../../api/types.ts';

/**
 * Business area 7 — management reporting (Assignment 1 Task 10).
 *
 * The two tabs are the two report classes change C2 produced. Assignment 2's
 * single `Report` would have had to render both of these from one shape; keeping
 * them separate is why each screen can show figures that actually mean something
 * — on-time delivery for shipments, idle resources for utilisation.
 *
 * Choosing a period with no activity shows a "no data" result rather than an
 * error, which is Assignment 1 Task 10 variant 1b.
 */
export function ReportsView(props: { api: ApiClient; refreshKey: number }): ReactNode {
  const [tab, setTab] = useState<'SHIPMENTS' | 'RESOURCES'>('SHIPMENTS');
  const [preset, setPreset] = useState('MONTH');
  const [scope, setScope] = useState<'branch' | 'all'>('branch');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [shipments, setShipments] = useState<ShipmentReportView | undefined>(undefined);
  const [resources, setResources] = useState<ResourceReportView | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [busy, setBusy] = useState(false);

  function query(): string {
    const parameters = new URLSearchParams({ preset });
    if (scope === 'all') {
      parameters.set('scope', 'all');
    }
    if (preset === 'CUSTOM') {
      if (start !== '') {
        parameters.set('start', new Date(start).toISOString());
      }
      if (end !== '') {
        parameters.set('end', new Date(end).toISOString());
      }
    }
    return parameters.toString();
  }

  async function run(): Promise<void> {
    setBusy(true);
    setError(undefined);
    try {
      if (tab === 'SHIPMENTS') {
        setShipments((await props.api.shipmentReport(query())) as unknown as ShipmentReportView);
      } else {
        setResources((await props.api.resourceReport(query())) as unknown as ResourceReportView);
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, props.refreshKey]);

  const report = tab === 'SHIPMENTS' ? shipments : resources;

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
        <p>
          Shipment statistics and resource utilisation, for your branch or across every branch. Reports read operational
          records and never change them.
        </p>
      </div>

      <ErrorBanner error={error} />

      <Card>
        <div className="row">
          <button
            className={tab === 'SHIPMENTS' ? 'btn' : 'btn quiet'}
            type="button"
            onClick={() => setTab('SHIPMENTS')}
          >
            Shipment statistics
          </button>
          <button
            className={tab === 'RESOURCES' ? 'btn' : 'btn quiet'}
            type="button"
            onClick={() => setTab('RESOURCES')}
          >
            Resource utilisation
          </button>
        </div>

        <div className="grid three" style={{ marginTop: 12 }}>
          <Select
            label="Reporting period"
            name="preset"
            value={preset}
            required
            options={[
              { value: 'DAY', label: 'Today' },
              { value: 'WEEK', label: 'Last 7 days' },
              { value: 'MONTH', label: 'This month' },
              { value: 'YEAR_TO_DATE', label: 'Year to date' },
              { value: 'CUSTOM', label: 'Custom range' },
            ]}
            onChange={setPreset}
          />
          <Select
            label="Scope"
            name="scope"
            value={scope}
            required
            options={[
              { value: 'branch', label: 'My branch only' },
              { value: 'all', label: 'All branches' },
            ]}
            onChange={(value) => setScope(value === 'all' ? 'all' : 'branch')}
          />
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 13 }}>
            <button className="btn" type="button" disabled={busy} onClick={() => void run()}>
              {busy ? 'Generating…' : 'Generate report'}
            </button>
          </div>
        </div>

        {preset === 'CUSTOM' ? (
          <div className="grid two">
            <Field label="From" name="start" type="date" value={start} required onChange={setStart} />
            <Field label="To" name="end" type="date" value={end} required onChange={setEnd} />
          </div>
        ) : null}
      </Card>

      {report === undefined ? (
        <p className="muted">Choose a period and generate a report.</p>
      ) : report.isEmpty ? (
        <EmptyState title="No data available for this period">
          <p>{report.headline}</p>
          <p className="small muted">
            {report.periodLabel} · {report.scopeLabel}
          </p>
        </EmptyState>
      ) : tab === 'SHIPMENTS' && shipments !== undefined ? (
        <>
          <Banner kind="info" title={`${shipments.periodLabel} · ${shipments.scopeLabel}`}>
            {shipments.headline}
          </Banner>

          <div className="grid three">
            <Stat label="Orders" value={String(shipments.totalOrders)} sub={`${shipments.splitShipmentCount} split`} />
            <Stat
              label="Delivered"
              value={String(shipments.deliveredCount)}
              sub={`${shipments.completionRate}% of all orders`}
            />
            <Stat
              label="On time"
              value={`${shipments.onTimeDeliveryRate}%`}
              sub={`${shipments.onTimeCount} of ${shipments.deliveredCount} deliveries`}
            />
            <Stat
              label="Cargo moved"
              value={`${shipments.totalCargoWeightKg.toLocaleString('en-US')} kg`}
            />
            <Stat
              label="Revenue invoiced"
              value={shipments.revenueInvoiced.formatted}
              sub={`${shipments.collectionRate}% collected`}
            />
            <Stat label="Revenue collected" value={shipments.revenueCollected.formatted} />
          </div>

          <div className="grid two" style={{ marginTop: 16 }}>
            <Card title="Orders by status">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th className="right">Orders</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(shipments.countsByStatus)
                      .filter(([, count]) => count > 0)
                      .map(([status, count]) => (
                        <tr key={status}>
                          <td>{status.replace(/_/g, ' ')}</td>
                          <td className="right">{count}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Busiest lanes">
              {shipments.busiestLanes.length === 0 ? (
                <p className="muted">No lane activity in this period.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Lane</th>
                        <th className="right">Orders</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipments.busiestLanes.map((lane) => (
                        <tr key={lane.lane}>
                          <td>{lane.lane}</td>
                          <td className="right">{lane.orderCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
          <p className="small muted">Generated {formatDateTime(shipments.generatedAt)}.</p>
        </>
      ) : resources !== undefined ? (
        <>
          <Banner kind="info" title={`${resources.periodLabel} · ${resources.scopeLabel}`}>
            {resources.headline}
          </Banner>

          <div className="grid three">
            <Stat label="Itineraries" value={String(resources.totalItineraries)} />
            <Stat
              label="Vehicle utilisation"
              value={`${resources.averageVehicleUtilisation}%`}
              sub={`${resources.idleVehicleCount} idle`}
            />
            <Stat
              label="Driver utilisation"
              value={`${resources.averageDriverUtilisation}%`}
              sub={`${resources.idleDriverCount} idle`}
            />
          </div>

          <div className="grid two" style={{ marginTop: 16 }}>
            <Card title="Vehicles" hint="Sorted by utilisation. Idle vehicles are candidates for redeployment.">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Vehicle</th>
                      <th className="right">Trips</th>
                      <th className="right">Hours</th>
                      <th className="right">Utilisation</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resources.vehicleRows.map((row) => (
                      <tr key={row.resourceId}>
                        <td className="wrap">{row.label}</td>
                        <td className="right">{row.itineraryCount}</td>
                        <td className="right">{row.committedHours}</td>
                        <td className="right">{row.utilisationPercent}%</td>
                        <td>{row.currentState.replace(/_/g, ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Drivers">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Driver</th>
                      <th className="right">Trips</th>
                      <th className="right">Hours</th>
                      <th className="right">Utilisation</th>
                      <th>State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resources.driverRows.map((row) => (
                      <tr key={row.resourceId}>
                        <td className="wrap">{row.label}</td>
                        <td className="right">{row.itineraryCount}</td>
                        <td className="right">{row.committedHours}</td>
                        <td className="right">{row.utilisationPercent}%</td>
                        <td>{row.currentState.replace(/_/g, ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          <p className="small muted">Generated {formatDateTime(resources.generatedAt)}.</p>
        </>
      ) : null}
    </>
  );
}
