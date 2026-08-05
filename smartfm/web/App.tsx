import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiClient, ApiError } from './api/ApiClient.ts';
import type { BranchView, CustomerView, DriverView, ReferenceData, SessionView } from './api/types.ts';
import { Banner } from './components/Ui.tsx';
import { SignInView } from './views/SignInView.tsx';
import { NewOrderView } from './views/customer/NewOrderView.tsx';
import { MyOrdersView } from './views/customer/MyOrdersView.tsx';
import { BillingView } from './views/customer/BillingView.tsx';
import { ProfileView } from './views/customer/ProfileView.tsx';
import { QueueView } from './views/branch/QueueView.tsx';
import { FleetView } from './views/branch/FleetView.tsx';
import { DriversView } from './views/branch/DriversView.tsx';
import { ReportsView } from './views/branch/ReportsView.tsx';
import { DriverJobsView } from './views/driver/DriverJobsView.tsx';

const TOKEN_KEY = 'smartfm.token';

interface Tab {
  id: string;
  label: string;
}

const TABS_BY_ROLE: Readonly<Record<SessionView['role'], Tab[]>> = {
  CUSTOMER: [
    { id: 'new-order', label: 'Place an order' },
    { id: 'orders', label: 'My orders & tracking' },
    { id: 'billing', label: 'Billing' },
    { id: 'profile', label: 'My account' },
  ],
  BRANCH_STAFF: [
    { id: 'queue', label: 'Order queue' },
    { id: 'fleet', label: 'Fleet' },
    { id: 'drivers', label: 'Drivers' },
    { id: 'reports', label: 'Reports' },
  ],
  DRIVER: [{ id: 'jobs', label: 'My jobs' }],
};


export function App(): ReactNode {
  const api = useMemo(() => new ApiClient(), []);
  const [session, setSession] = useState<SessionView | undefined>(undefined);
  const [reference, setReference] = useState<ReferenceData | undefined>(undefined);
  const [tab, setTab] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [startupError, setStartupError] = useState<string | undefined>(undefined);
  const [restoring, setRestoring] = useState(true);

  /** Loads the reference data and restores a stored session, if there is one. */
  useEffect(() => {
    async function bootstrap(): Promise<void> {
      try {
        setReference((await api.reference()) as unknown as ReferenceData);
      } catch (error) {
        setStartupError(
          error instanceof ApiError
            ? error.message
            : 'Cannot reach the SmartFM application server. Start it with `npm run server`.',
        );
        setRestoring(false);
        return;
      }

      const stored = window.localStorage.getItem(TOKEN_KEY);
      if (stored !== null && stored !== '') {
        api.setToken(stored);
        try {
          const restored = (await api.session()) as unknown as SessionView;
          applySession(restored);
        } catch {
          window.localStorage.removeItem(TOKEN_KEY);
          api.setToken(undefined);
        }
      }
      setRestoring(false);
    }
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applySession(next: SessionView): void {
    setSession(next);
    setTab(TABS_BY_ROLE[next.role][0]?.id ?? '');
  }

  function signIn(next: SessionView, token: string): void {
    window.localStorage.setItem(TOKEN_KEY, token);
    api.setToken(token);
    applySession(next);
  }

  async function signOut(): Promise<void> {
    try {
      await api.signOut();
    } catch {
      // Signing out locally is what matters ~ the server session expires anyway.
    }
    window.localStorage.removeItem(TOKEN_KEY);
    api.setToken(undefined);
    setSession(undefined);
    setTab('');
  }

  function refresh(): void {
    setRefreshKey((previous) => previous + 1);
  }

  if (restoring) {
    return (
      <div className="page">
        <p className="muted">Starting SmartFM…</p>
      </div>
    );
  }

  if (startupError !== undefined) {
    return (
      <div className="page">
        <Banner kind="error" title="SmartFM cannot start">
          {startupError}
          <div style={{ marginTop: 8 }}>
            Run <span className="mono">npm run server</span> in one terminal and{' '}
            <span className="mono">npm run dev</span> in another, then reload this page.
          </div>
        </Banner>
      </div>
    );
  }

  if (session === undefined) {
    return <SignInView api={api} reference={reference} onSignedIn={signIn} />;
  }

  const tabs = TABS_BY_ROLE[session.role];
  const profileName =
    session.role === 'CUSTOMER'
      ? (session.profile as CustomerView | null)?.fullName
      : session.role === 'BRANCH_STAFF'
        ? (session.profile as BranchView | null)?.name
        : (session.profile as DriverView | null)?.fullName;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          SmartFM
          <small>ABC-Trans · Smart Fleet Management</small>
        </div>
        <div className="spacer" />
        <div className="who">
          <strong>{profileName ?? session.username}</strong>
          {session.role.replace('_', ' ').toLowerCase()}
        </div>
        <button className="btn quiet small" type="button" onClick={refresh}>
          Refresh
        </button>
        <button className="btn secondary small" type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </header>

      <nav className="tabs" aria-label="Sections">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-current={tab === entry.id ? 'page' : undefined}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <main className="page">
        {reference === undefined ? (
          <p className="muted">Loading reference data…</p>
        ) : (
          <>
            {/*customer */}
            {tab === 'new-order' ? (
              <NewOrderView api={api} reference={reference} onOrderPlaced={refresh} />
            ) : null}
            {tab === 'orders' ? <MyOrdersView api={api} reference={reference} refreshKey={refreshKey} /> : null}
            {tab === 'billing' ? <BillingView api={api} reference={reference} refreshKey={refreshKey} /> : null}
            {tab === 'profile' && session.profile !== null ? (
              <ProfileView
                api={api}
                reference={reference}
                profile={session.profile as CustomerView}
                refreshKey={refreshKey}
                onProfileChanged={(customer) => setSession({ ...session, profile: customer })}
                onSignedOut={() => void signOut()}
              />
            ) : null}

            {/*branch staff */}
            {tab === 'queue' ? (
              <QueueView api={api} staffName={session.username} refreshKey={refreshKey} onChanged={refresh} />
            ) : null}
            {tab === 'fleet' ? <FleetView api={api} reference={reference} refreshKey={refreshKey} /> : null}
            {tab === 'drivers' ? <DriversView api={api} reference={reference} refreshKey={refreshKey} /> : null}
            {tab === 'reports' ? <ReportsView api={api} refreshKey={refreshKey} /> : null}

            {/*driver */}
            {tab === 'jobs' ? <DriverJobsView api={api} reference={reference} refreshKey={refreshKey} /> : null}
          </>
        )}
      </main>
    </div>
  );
}
