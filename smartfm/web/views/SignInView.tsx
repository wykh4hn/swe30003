import { useState } from 'react';
import type { ReactNode } from 'react';
import { Banner, ErrorBanner, Field } from '../components/Ui.tsx';
import type { ApiClient } from '../api/ApiClient.ts';
import type { ReferenceData, SessionView } from '../api/types.ts';
import { RegisterView } from './RegisterView.tsx';

/**
 * The sign-in screen — the empty starting state of every demonstration scenario.
 *
 * The seeded accounts are listed on the panel beside the form so the system can
 * be demonstrated with no external crib sheet, which is what the Assignment 3
 * mark sheet means by an illustrated home screen.
 */
export function SignInView(props: {
  api: ApiClient;
  reference: ReferenceData | undefined;
  onSignedIn: (session: SessionView, token: string) => void;
}): ReactNode {
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  /** Client-side checks mirror the server's, so obvious mistakes never leave the browser. */
  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (username.trim() === '') {
      errors['username'] = 'Enter the email address for your account.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(username.trim())) {
      errors['username'] = 'That does not look like an email address.';
    }
    if (password === '') {
      errors['password'] = 'Enter your password.';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit(): Promise<void> {
    setError(undefined);
    setNotice(undefined);
    if (!validate()) {
      return;
    }
    setBusy(true);
    try {
      const result = (await props.api.signIn(username.trim(), password)) as unknown as SessionView & { token: string };
      props.onSignedIn(result, result.token);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  function useDemoAccount(account: string): void {
    setUsername(account);
    setPassword(props.reference?.demoPassword ?? '');
    setFieldErrors({});
    setError(undefined);
  }

  return (
    <div className="signin-shell">
      <div className="signin-card">
        <aside className="intro">
          <h1>SmartFM</h1>
          <p>
            Smart Fleet Management for <strong>ABC-Trans</strong> — one system for customer ordering, fleet and driver
            management, dispatch, live tracking, billing and management reporting across every branch.
          </p>
          <p className="small" style={{ opacity: 0.7 }}>
            SWE30003 Software Architectures &amp; Design · Assignment 3 · Group 1
          </p>

          {props.reference !== undefined ? (
            <>
              <h3 style={{ marginTop: 18 }}>Demonstration accounts</h3>
              <p className="small" style={{ opacity: 0.8 }}>
                Every account uses the password <span className="mono">{props.reference.demoPassword}</span>. Select one
                to fill the form.
              </p>
              <div className="table-wrap" style={{ background: 'transparent', border: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.reference.demoAccounts.map((account) => (
                      <tr key={account.username}>
                        <td>{account.role}</td>
                        <td>
                          <button
                            type="button"
                            className="btn small quiet"
                            onClick={() => useDemoAccount(account.username)}
                          >
                            {account.username}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="small">Connecting to the SmartFM server…</p>
          )}
        </aside>

        <div className="form">
          {mode === 'sign-in' ? (
            <>
              <h2>Sign in</h2>
              <p className="hint">Use your ABC-Trans account. Customers, branch staff and drivers all sign in here.</p>

              {notice !== undefined ? <Banner kind="success">{notice}</Banner> : null}
              <ErrorBanner error={error} />

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
                }}
                noValidate
              >
                <Field
                  label="Email address"
                  name="username"
                  type="email"
                  value={username}
                  required
                  placeholder="name@example.com"
                  error={fieldErrors['username']}
                  onChange={(value) => {
                    setUsername(value);
                    setFieldErrors((previous) => ({ ...previous, username: '' }));
                  }}
                />
                <Field
                  label="Password"
                  name="password"
                  type="password"
                  value={password}
                  required
                  error={fieldErrors['password']}
                  onChange={(value) => {
                    setPassword(value);
                    setFieldErrors((previous) => ({ ...previous, password: '' }));
                  }}
                />
                <div className="row">
                  <button className="btn" type="submit" disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                  </button>
                  <button
                    className="btn quiet"
                    type="button"
                    onClick={() => {
                      setMode('register');
                      setError(undefined);
                    }}
                  >
                    Create a customer account
                  </button>
                </div>
              </form>
            </>
          ) : (
            <RegisterView
              api={props.api}
              reference={props.reference}
              onCancel={() => setMode('sign-in')}
              onRegistered={(email) => {
                setMode('sign-in');
                setUsername(email);
                setPassword('');
                setNotice('Your account is ready. Sign in with the password you chose.');
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
