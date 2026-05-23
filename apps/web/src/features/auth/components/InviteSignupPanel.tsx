import { useEffect, useState, type FormEvent } from 'react';
import { getInviteStatus, register, toApiErrorMessage } from '../../shared/services/api';
import type { AuthResponse, InviteStatus } from '../../shared/services/types';

interface InviteSignupPanelProps {
  inviteToken: string;
  onAuthenticated: (response: AuthResponse) => void;
}

export function InviteSignupPanel({
  inviteToken,
  onAuthenticated,
}: InviteSignupPanelProps) {
  const [inviteStatus, setInviteStatus] = useState<InviteStatus | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      setInviteLoading(true);
      setInviteError(null);
      setInviteStatus(null);

      try {
        const status = await getInviteStatus(inviteToken);
        if (!cancelled) {
          setInviteStatus(status);
        }
      } catch (error) {
        if (!cancelled) {
          setInviteError(
            toApiErrorMessage(error, 'This invite link is invalid or has expired.'),
          );
        }
      } finally {
        if (!cancelled) {
          setInviteLoading(false);
        }
      }
    }

    void loadInvite();

    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!inviteStatus) {
      setSubmitError('Invite link is not valid.');
      return;
    }

    if (password !== confirmPassword) {
      setSubmitError('Password and confirmation do not match.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const response = await register({
        email,
        name,
        password,
        inviteToken,
      });
      onAuthenticated(response);
    } catch (error) {
      setSubmitError(toApiErrorMessage(error, 'Unable to create account.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (inviteLoading) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <p className="eyebrow">Invite Required</p>
          <h1>Checking Invite Link...</h1>
        </section>
      </main>
    );
  }

  if (inviteError || !inviteStatus) {
    return (
      <main className="auth-page">
        <section className="auth-panel">
          <p className="eyebrow">Invite Required</p>
          <h1>Invite Not Valid</h1>
          <p className="subline">
            {inviteError ?? 'This invite link cannot be used for signup.'}
          </p>
          <div className="switch-row">
            <button
              type="button"
              className="ghost-button"
              onClick={() => window.location.assign('/')}
            >
              Back To Sign In
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Invite Signup</p>
        <h1>Create Your Account</h1>
        <p className="subline">
          You were invited by {inviteStatus.inviterName}. Complete your account to
          join Yeen.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Display Name
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={64}
              placeholder="Captain Movie Night"
            />
          </label>

          <label>
            Email
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@domain.com"
            />
          </label>

          <label>
            Password
            <input
              required
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              placeholder="At least 8 characters"
            />
          </label>

          <label>
            Confirm Password
            <input
              required
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              placeholder="Repeat your password"
            />
          </label>

          {submitError ? <p className="error-text">{submitError}</p> : null}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
      </section>
    </main>
  );
}
