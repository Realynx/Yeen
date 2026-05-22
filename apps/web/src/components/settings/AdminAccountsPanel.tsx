import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { AdminAccountsState } from '../../pages/settings/useAdminAccounts';

interface AdminAccountsPanelProps {
  adminAccountsState: AdminAccountsState;
}

export function AdminAccountsPanel({
  adminAccountsState,
}: AdminAccountsPanelProps) {
  const {
    accounts,
    loadingAccounts,
    creatingAccount,
    updatingAccountId,
    accountsMessage,
    accountsError,
    createAccount,
    setAccountInvites,
    setAccountRole,
  } = adminAccountsState;

  const [createAccountName, setCreateAccountName] = useState('');
  const [createAccountEmail, setCreateAccountEmail] = useState('');
  const [createAccountPassword, setCreateAccountPassword] = useState('');
  const [createAccountRole, setCreateAccountRole] = useState<
    'admin' | 'sailer' | 'user'
  >('user');
  const [createAccountInvites, setCreateAccountInvites] = useState('0');
  const [inviteDrafts, setInviteDrafts] = useState<Record<string, string>>({});
  const [accountQuery, setAccountQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<
    'all' | 'admin' | 'sailer' | 'user'
  >('all');

  useEffect(() => {
    setInviteDrafts((previous) => {
      const next: Record<string, string> = {};

      for (const account of accounts) {
        if (account.role === 'admin') {
          continue;
        }

        const previousValue = previous[account.id];
        next[account.id] = previousValue ?? String(account.invitesRemaining ?? 0);
      }

      return next;
    });
  }, [accounts]);

  const adminCount = useMemo(
    () => accounts.filter((account) => account.role === 'admin').length,
    [accounts],
  );
  const sailerCount = useMemo(
    () => accounts.filter((account) => account.role === 'sailer').length,
    [accounts],
  );
  const userCount = accounts.length - adminCount - sailerCount;
  const totalInvites = useMemo(
    () =>
      accounts.reduce((sum, account) => {
        if (account.role === 'admin') {
          return sum;
        }

        return sum + Math.max(0, account.invitesRemaining ?? 0);
      }, 0),
    [accounts],
  );
  const normalizedAccountQuery = accountQuery.trim().toLowerCase();
  const filteredAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        if (roleFilter !== 'all' && account.role !== roleFilter) {
          return false;
        }

        if (!normalizedAccountQuery) {
          return true;
        }

        const searchable = `${account.name} ${account.email} ${account.invitedByName ?? ''}`
          .toLowerCase();

        return searchable.includes(normalizedAccountQuery);
      }),
    [accounts, normalizedAccountQuery, roleFilter],
  );

  function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = createAccountName.trim();
    const normalizedEmail = createAccountEmail.trim();
    const normalizedPassword = createAccountPassword;
    const parsedInvites = Number.parseInt(createAccountInvites, 10);
    const normalizedInvites = Number.isFinite(parsedInvites)
      ? Math.max(0, parsedInvites)
      : 0;

    if (!normalizedName || !normalizedEmail || !normalizedPassword) {
      return;
    }

    void createAccount({
      name: normalizedName,
      email: normalizedEmail,
      password: normalizedPassword,
      role: createAccountRole,
      invitesRemaining:
        createAccountRole === 'admin' ? undefined : normalizedInvites,
    }).then((created) => {
      if (!created) {
        return;
      }

      setCreateAccountName('');
      setCreateAccountEmail('');
      setCreateAccountPassword('');
      setCreateAccountRole('user');
      setCreateAccountInvites('0');
    });
  }

  function handleSaveInvites(accountId: string) {
    const rawValue = inviteDrafts[accountId] ?? '0';
    const parsed = Number.parseInt(rawValue, 10);
    const normalized = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;

    void setAccountInvites(accountId, normalized).then((saved) => {
      if (!saved) {
        return;
      }

      setInviteDrafts((previous) => ({
        ...previous,
        [accountId]: String(normalized),
      }));
    });
  }

  function handleSetRole(
    accountId: string,
    nextRole: 'admin' | 'sailer' | 'user',
  ) {
    void setAccountRole(accountId, nextRole);
  }

  return (
    <section className="settings-content-grid admin-accounts-layout">
      <article className="settings-surface settings-surface-full">
        <header className="settings-surface-header">
          <div>
            <p className="settings-section-kicker">Identity</p>
            <h2>Account & Access</h2>
          </div>
          <span className="settings-pill">Admin Only</span>
        </header>

        <div className="admin-accounts-summary-grid" aria-live="polite">
          <article className="admin-accounts-summary-card">
            <p className="admin-accounts-summary-kicker">Total Accounts</p>
            <p className="admin-accounts-summary-value">{accounts.length}</p>
            <p className="admin-accounts-summary-note">All active profiles</p>
          </article>

          <article className="admin-accounts-summary-card">
            <p className="admin-accounts-summary-kicker">Admins</p>
            <p className="admin-accounts-summary-value">{adminCount}</p>
            <p className="admin-accounts-summary-note">Unlimited invite access</p>
          </article>

          <article className="admin-accounts-summary-card">
            <p className="admin-accounts-summary-kicker">Sailers</p>
            <p className="admin-accounts-summary-value">{sailerCount}</p>
            <p className="admin-accounts-summary-note">
              Torrent search and downloads
            </p>
          </article>

          <article className="admin-accounts-summary-card">
            <p className="admin-accounts-summary-kicker">Users</p>
            <p className="admin-accounts-summary-value">{userCount}</p>
            <p className="admin-accounts-summary-note">Media-only access</p>
          </article>

          <article className="admin-accounts-summary-card">
            <p className="admin-accounts-summary-kicker">Invites Remaining</p>
            <p className="admin-accounts-summary-value">{totalInvites}</p>
            <p className="admin-accounts-summary-note">Across all user accounts</p>
          </article>
        </div>

        {accountsMessage ? <p className="scan-success">{accountsMessage}</p> : null}
        {accountsError ? <p className="error-text">{accountsError}</p> : null}
      </article>

      <article className="settings-surface settings-surface-large admin-accounts-provision-card">
        <header className="settings-surface-header">
          <div>
            <p className="settings-section-kicker">Provisioning</p>
            <h2>Create Account</h2>
          </div>
          <span className="settings-pill">Immediate</span>
        </header>

        <p className="muted admin-accounts-section-copy">
          Create user, sailer, or admin identities directly. Admins are always
          unlimited, while user and sailer accounts can start with a defined
          invite balance.
        </p>

        <form className="system-settings-form" onSubmit={handleCreateAccount}>
          <label className="settings-field">
            <span className="settings-field-label">Display Name</span>
            <input
              type="text"
              value={createAccountName}
              onChange={(event) => setCreateAccountName(event.target.value)}
              minLength={2}
              maxLength={64}
              required
              placeholder="Movie Night Host"
            />
          </label>

          <label className="settings-field">
            <span className="settings-field-label">Email</span>
            <input
              type="email"
              value={createAccountEmail}
              onChange={(event) => setCreateAccountEmail(event.target.value)}
              required
              placeholder="friend@example.com"
            />
          </label>

          <label className="settings-field">
            <span className="settings-field-label">Password</span>
            <input
              type="password"
              value={createAccountPassword}
              onChange={(event) => setCreateAccountPassword(event.target.value)}
              minLength={8}
              maxLength={72}
              required
              placeholder="At least 8 characters"
            />
          </label>

          <label className="settings-field">
            <span className="settings-field-label">Role</span>
            <select
              value={createAccountRole}
              onChange={(event) =>
                setCreateAccountRole(
                  event.target.value as 'admin' | 'sailer' | 'user',
                )
              }
            >
              <option value="user">User</option>
              <option value="sailer">Sailer</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <label className="settings-field settings-field-wide">
            <span className="settings-field-label">Starting Invites</span>
            <input
              type="number"
              min={0}
              max={100000}
              value={createAccountInvites}
              onChange={(event) => setCreateAccountInvites(event.target.value)}
              disabled={createAccountRole === 'admin'}
            />
            <small className="settings-field-hint">
              Admin accounts are always unlimited. User and sailer accounts
              default to 0.
            </small>
          </label>

          <div className="system-settings-footer settings-field-wide">
            <p className="muted">Accounts are created immediately after submit.</p>
            <div className="settings-actions-row">
              <button
                className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                type="submit"
                disabled={creatingAccount}
              >
                {creatingAccount ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        </form>
      </article>

      <article className="settings-surface settings-profile-card admin-accounts-manage-card">
        <header className="settings-surface-header">
          <div>
            <p className="settings-section-kicker">Invite Balances</p>
            <h2>Manage Accounts</h2>
          </div>
          <span className="settings-pill">
            {loadingAccounts
              ? 'Loading'
              : `${filteredAccounts.length} of ${accounts.length}`}
          </span>
        </header>

        <p className="muted admin-accounts-section-copy">
          Promote users to sailer/admin or demote access as needed. Invite
          balances for non-admin accounts can be adjusted in place.
        </p>

        <div className="admin-accounts-manage-toolbar">
          <label className="settings-field admin-accounts-search-field">
            <span className="settings-field-label">Find Account</span>
            <input
              type="search"
              value={accountQuery}
              onChange={(event) => setAccountQuery(event.target.value)}
              placeholder="Search name, email, or inviter"
            />
          </label>

          <label className="settings-field admin-accounts-filter-field">
            <span className="settings-field-label">Role</span>
            <select
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(
                  event.target.value as 'all' | 'admin' | 'sailer' | 'user',
                )
              }
            >
              <option value="all">All Roles</option>
              <option value="admin">Admins</option>
              <option value="sailer">Sailers</option>
              <option value="user">Users</option>
            </select>
          </label>

          <p className="admin-accounts-results-note muted">
            {loadingAccounts
              ? 'Loading account directory...'
              : `Showing ${filteredAccounts.length} account${
                  filteredAccounts.length === 1 ? '' : 's'
                }`}
          </p>
        </div>

        {loadingAccounts ? (
          <p className="muted">Loading accounts...</p>
        ) : filteredAccounts.length === 0 ? (
          <p className="muted admin-accounts-empty-state">
            No accounts match that filter.
          </p>
        ) : (
          <ul className="settings-account-list">
            {filteredAccounts.map((account) => {
              const isLastAdmin = account.role === 'admin' && adminCount <= 1;

              return (
                <li key={account.id} className="settings-account-item">
                  <div className="settings-account-main">
                    <div className="settings-account-header-line">
                      <p className="settings-account-name">{account.name}</p>
                      <span
                        className={`settings-account-role-badge is-${account.role}`}
                      >
                        {account.role}
                      </span>
                    </div>
                    <p className="settings-account-meta">{account.email}</p>
                    <p className="settings-account-submeta">
                      <span>
                        {account.invitedByName
                          ? `Invited by ${account.invitedByName}`
                          : 'Created manually'}
                      </span>
                      <span>
                        {account.role === 'admin'
                          ? 'Unlimited invites'
                          : `${Math.max(0, account.invitesRemaining ?? 0)} invites remaining`}
                      </span>
                    </p>
                  </div>

                  {account.role === 'admin' ? (
                    <div className="settings-actions-row">
                      <span className="settings-account-invite-lock">Unlimited</span>
                      <button
                        type="button"
                        className="ghost-button small"
                        disabled={updatingAccountId === account.id || isLastAdmin}
                        onClick={() => handleSetRole(account.id, 'sailer')}
                      >
                        {updatingAccountId === account.id
                          ? 'Saving...'
                          : 'Set as Sailer'}
                      </button>
                      <button
                        type="button"
                        className="ghost-button small"
                        disabled={updatingAccountId === account.id || isLastAdmin}
                        onClick={() => handleSetRole(account.id, 'user')}
                      >
                        {updatingAccountId === account.id
                          ? 'Saving...'
                          : 'Set as User'}
                      </button>
                    </div>
                  ) : (
                    <div className="settings-actions-row">
                      <div className="settings-account-invite-editor">
                        <input
                          type="number"
                          min={0}
                          max={100000}
                          value={
                            inviteDrafts[account.id] ??
                            String(account.invitesRemaining ?? 0)
                          }
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setInviteDrafts((previous) => ({
                              ...previous,
                              [account.id]: nextValue,
                            }));
                          }}
                        />
                        <button
                          type="button"
                          className="ghost-button small"
                          disabled={updatingAccountId === account.id}
                          onClick={() => handleSaveInvites(account.id)}
                        >
                          {updatingAccountId === account.id ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                      {account.role === 'user' ? (
                        <button
                          type="button"
                          className="ghost-button small"
                          disabled={updatingAccountId === account.id}
                          onClick={() => handleSetRole(account.id, 'sailer')}
                        >
                          {updatingAccountId === account.id
                            ? 'Saving...'
                            : 'Set as Sailer'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ghost-button small"
                          disabled={updatingAccountId === account.id}
                          onClick={() => handleSetRole(account.id, 'user')}
                        >
                          {updatingAccountId === account.id
                            ? 'Saving...'
                            : 'Set as User'}
                        </button>
                      )}
                      <button
                        type="button"
                        className="ghost-button small"
                        disabled={updatingAccountId === account.id}
                        onClick={() => handleSetRole(account.id, 'admin')}
                      >
                        {updatingAccountId === account.id
                          ? 'Saving...'
                          : 'Set as Admin'}
                      </button>
                    </div>
                  )}

                  {isLastAdmin ? (
                    <small className="settings-field-hint">
                      At least one admin account is required.
                    </small>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </article>
    </section>
  );
}
