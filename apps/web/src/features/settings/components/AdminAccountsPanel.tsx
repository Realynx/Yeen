import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { AdminAccountsState } from '../services/useAdminAccounts';
import type { AdminManagedAccount } from '../../shared/services/types';

interface AdminAccountsPanelProps {
  adminAccountsState: AdminAccountsState;
}

function normalizeInvitesInput(rawValue: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function normalizeBitrateInput(rawValue: string): number | null {
  const parsed = Number.parseInt(rawValue.trim(), 10);
  return Number.isFinite(parsed) ? Math.max(250, Math.min(50000, parsed)) : null;
}

function toProgressLabel(progressPercent: number): string {
  const normalized = Number.isFinite(progressPercent)
    ? Math.max(0, Math.min(100, Math.round(progressPercent)))
    : 0;
  return `${normalized}%`;
}

function toLastSeenLabel(value: string | null): string {
  if (!value) {
    return 'No activity recorded yet';
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return 'No activity recorded yet';
  }

  return new Date(parsed).toLocaleString();
}

export function AdminAccountsPanel({
  adminAccountsState,
}: AdminAccountsPanelProps) {
  const {
    accounts,
    activityOverview,
    loadingAccounts,
    loadingActivity,
    updatingAccountId,
    accountsMessage,
    accountsError,
    setAccountInvites,
    setAccountMaxBitrate,
    setAccountRole,
    updateAccountProfile,
    resetAccountPassword,
  } = adminAccountsState;

  const [accountQuery, setAccountQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<
    'all' | 'admin' | 'sailer' | 'user'
  >('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'sailer' | 'user'>('user');
  const [editInvites, setEditInvites] = useState('0');
  const [editMaxBitrate, setEditMaxBitrate] = useState('');
  const [resetPasswordDraft, setResetPasswordDraft] = useState('');
  const [editorNotice, setEditorNotice] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectedAccountId) {
      return;
    }

    const exists = accounts.some((account) => account.id === selectedAccountId);
    if (!exists) {
      setSelectedAccountId(null);
    }
  }, [accounts, selectedAccountId]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
  const customBitrateCount = useMemo(
    () =>
      accounts.filter((account) => typeof account.maxBitrateKbps === 'number')
        .length,
    [accounts],
  );
  const activitySummary = activityOverview?.summary ?? null;
  const activeAccountCount = activitySummary?.activeAccounts ?? 0;
  const activeWatcherCount = activitySummary?.activeWatchers ?? 0;
  const activeDownloadCount = activitySummary?.activeDownloads ?? 0;
  const recentlyActiveCount = activitySummary?.recentlyActiveAccounts ?? 0;

  const activityByAccount = useMemo(
    () =>
      new Map(
        (activityOverview?.accounts ?? []).map((activity) => [
          activity.accountId,
          activity,
        ]),
      ),
    [activityOverview],
  );

  const activeAccountActivity = useMemo(
    () =>
      (activityOverview?.accounts ?? [])
        .filter(
          (activity) =>
            activity.watching.length > 0 || activity.downloading.length > 0,
        )
        .slice(0, 8),
    [activityOverview],
  );

  const activityDownloads = useMemo(
    () => (activityOverview?.downloads ?? []).slice(0, 8),
    [activityOverview],
  );
  const accountsById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
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

  const selectedAccount = useMemo(
    () =>
      selectedAccountId
        ? (accounts.find((account) => account.id === selectedAccountId) ?? null)
        : null,
    [accounts, selectedAccountId],
  );
  const selectedIsLastAdmin =
    selectedAccount?.role === 'admin' && adminCount <= 1;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectedAccount) {
      return;
    }

    setEditName(selectedAccount.name);
    setEditEmail(selectedAccount.email);
    setEditRole(selectedAccount.role);
    setEditInvites(String(Math.max(0, selectedAccount.invitesRemaining ?? 0)));
    setEditMaxBitrate(
      typeof selectedAccount.maxBitrateKbps === 'number'
        ? String(selectedAccount.maxBitrateKbps)
        : '',
    );
    setResetPasswordDraft('');
    setEditorNotice(null);
  }, [selectedAccount]);

  useEffect(() => {
    if (!selectedAccountId) {
      return;
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setSelectedAccountId(null);
      }
    }

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [selectedAccountId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function openAccountEditor(account: AdminManagedAccount) {
    setSelectedAccountId(account.id);
  }

  function closeAccountEditor() {
    setSelectedAccountId(null);
  }

  function handleAccountRowKeyDown(
    event: ReactKeyboardEvent<HTMLLIElement>,
    account: AdminManagedAccount,
  ) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    openAccountEditor(account);
  }

  async function handleSaveAccountEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedAccount) {
      return;
    }

    const normalizedName = editName.trim();
    const normalizedEmail = editEmail.trim().toLowerCase();

    if (!normalizedName || !normalizedEmail) {
      setEditorNotice('Name and email are required.');
      return;
    }

    if (selectedIsLastAdmin && editRole !== 'admin') {
      setEditorNotice('At least one admin account is required.');
      return;
    }

    const currentEmail = selectedAccount.email.trim().toLowerCase();
    const currentName = selectedAccount.name.trim();
    const currentRole = selectedAccount.role;
    const currentInvites = Math.max(0, selectedAccount.invitesRemaining ?? 0);
    const currentMaxBitrate =
      typeof selectedAccount.maxBitrateKbps === 'number'
        ? Math.max(250, Math.min(50000, selectedAccount.maxBitrateKbps))
        : null;

    const nextInvites = normalizeInvitesInput(editInvites);
    const nextMaxBitrate = normalizeBitrateInput(editMaxBitrate);
    let savedAny = false;

    if (normalizedName !== currentName || normalizedEmail !== currentEmail) {
      const saved = await updateAccountProfile(selectedAccount.id, {
        email: normalizedEmail,
        name: normalizedName,
      });
      if (!saved) {
        return;
      }

      savedAny = true;
    }

    if (editRole !== currentRole) {
      const saved = await setAccountRole(selectedAccount.id, editRole);
      if (!saved) {
        return;
      }

      savedAny = true;
    }

    if (editRole !== 'admin' && nextInvites !== currentInvites) {
      const saved = await setAccountInvites(selectedAccount.id, nextInvites);
      if (!saved) {
        return;
      }
      savedAny = true;
    }

    if (nextMaxBitrate !== currentMaxBitrate) {
      const saved = await setAccountMaxBitrate(selectedAccount.id, nextMaxBitrate);
      if (!saved) {
        return;
      }
      savedAny = true;
    }

    setEditorNotice(savedAny ? null : 'No changes to save.');
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedAccount) {
      return;
    }

    const nextPassword = resetPasswordDraft.trim();
    if (nextPassword.length < 8) {
      setEditorNotice('Password must be at least 8 characters.');
      return;
    }

    const saved = await resetAccountPassword(selectedAccount.id, nextPassword);
    if (!saved) {
      return;
    }

    setResetPasswordDraft('');
    setEditorNotice('Password reset successfully.');
  }

  const selectedActivity = selectedAccount
    ? activityByAccount.get(selectedAccount.id) ?? null
    : null;

  const selectedLastActiveLabel = selectedActivity
    ? toLastSeenLabel(selectedActivity.lastActivityAt)
    : 'No activity recorded yet';

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
            <p className="admin-accounts-summary-note">Across user accounts</p>
          </article>

          <article className="admin-accounts-summary-card">
            <p className="admin-accounts-summary-kicker">Bitrate Overrides</p>
            <p className="admin-accounts-summary-value">{customBitrateCount}</p>
            <p className="admin-accounts-summary-note">Custom transcode caps</p>
          </article>

          <article className="admin-accounts-summary-card">
            <p className="admin-accounts-summary-kicker">Active Accounts</p>
            <p className="admin-accounts-summary-value">{activeAccountCount}</p>
            <p className="admin-accounts-summary-note">Watching or downloading now</p>
          </article>

          <article className="admin-accounts-summary-card">
            <p className="admin-accounts-summary-kicker">Watching Now</p>
            <p className="admin-accounts-summary-value">{activeWatcherCount}</p>
            <p className="admin-accounts-summary-note">Users in playback progress</p>
          </article>

          <article className="admin-accounts-summary-card">
            <p className="admin-accounts-summary-kicker">Active Downloads</p>
            <p className="admin-accounts-summary-value">{activeDownloadCount}</p>
            <p className="admin-accounts-summary-note">
              Recently active users: {recentlyActiveCount}
            </p>
          </article>
        </div>

        {accountsMessage ? <p className="scan-success">{accountsMessage}</p> : null}
        {accountsError ? <p className="error-text">{accountsError}</p> : null}
      </article>

      <article className="settings-surface settings-surface-large admin-accounts-activity-card">
        <header className="settings-surface-header">
          <div>
            <p className="settings-section-kicker">Activity</p>
            <h2>User Activity & Media</h2>
          </div>
          <span className="settings-pill">
            {loadingActivity
              ? 'Loading'
              : `${activeAccountActivity.length} active`}
          </span>
        </header>

        <p className="muted admin-accounts-section-copy">
          Live view of what your users are watching and what media is currently
          downloading in the queue.
        </p>

        {loadingActivity ? (
          <p className="muted">Loading account activity...</p>
        ) : (
          <div className="admin-accounts-activity-layout">
            <section className="admin-accounts-activity-column">
              <h3 className="admin-accounts-activity-heading">Users Watching / Downloading</h3>

              {activeAccountActivity.length === 0 ? (
                <p className="muted admin-accounts-activity-empty">
                  No active user playback or download-linked activity right now.
                </p>
              ) : (
                <ul className="admin-accounts-activity-list">
                  {activeAccountActivity.map((activity) => {
                    const account = accountsById.get(activity.accountId);
                    if (!account) {
                      return null;
                    }

                    return (
                      <li key={activity.accountId} className="admin-accounts-activity-item">
                        <div className="admin-accounts-activity-account-line">
                          <p className="admin-accounts-activity-account-name">{account.name}</p>
                          <span className={`settings-account-role-badge is-${account.role}`}>
                            {account.role}
                          </span>
                        </div>

                        {activity.watching.length > 0 ? (
                          <div className="admin-accounts-media-pill-row">
                            {activity.watching.map((item) => (
                              <span key={`watching:${activity.accountId}:${item.mediaId}`} className="admin-accounts-media-pill is-watching">
                                {item.title} ({toProgressLabel(item.progressPercent)})
                              </span>
                            ))}
                          </div>
                        ) : null}

                        {activity.downloading.length > 0 ? (
                          <div className="admin-accounts-media-pill-row">
                            {activity.downloading.map((item) => (
                              <span key={`downloading:${activity.accountId}:${item.mediaId}`} className="admin-accounts-media-pill is-downloading">
                                {item.title} ({toProgressLabel(item.progressPercent)})
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <p className="admin-accounts-activity-meta muted">
                          {activity.inProgressCount} in progress • Last active {toLastSeenLabel(activity.lastActivityAt)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="admin-accounts-activity-column">
              <h3 className="admin-accounts-activity-heading">Active Download Queue</h3>

              {activityDownloads.length === 0 ? (
                <p className="muted admin-accounts-activity-empty">
                  No active downloads detected in the queue.
                </p>
              ) : (
                <ul className="admin-accounts-download-list">
                  {activityDownloads.map((item) => (
                    <li key={item.hash} className="admin-accounts-download-item">
                      <p className="admin-accounts-download-title">{item.title}</p>
                      <p className="admin-accounts-download-meta muted">
                        {toProgressLabel(item.progressPercent)} • {item.state}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
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
          Double-click a user row to open the edit card for role, limits,
          profile details, and password reset.
        </p>

        <div className="admin-accounts-toolbar-compact">
          <input
            className="admin-accounts-search-input-compact"
            type="search"
            value={accountQuery}
            onChange={(event) => setAccountQuery(event.target.value)}
            placeholder="Search accounts"
            aria-label="Search accounts by name, email, or inviter"
          />

          <select
            className="admin-accounts-role-select-compact"
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(
                event.target.value as 'all' | 'admin' | 'sailer' | 'user',
              )
            }
            aria-label="Filter accounts by role"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admins</option>
            <option value="sailer">Sailers</option>
            <option value="user">Users</option>
          </select>

          <p className="admin-accounts-results-pill muted" aria-live="polite">
            {loadingAccounts
              ? 'Loading account directory...'
              : `${filteredAccounts.length} account${
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
          <ul className="settings-account-list admin-accounts-click-list">
            {filteredAccounts.map((account) => {
              const accountActivity = activityByAccount.get(account.id) ?? null;
              const isLastAdmin = account.role === 'admin' && adminCount <= 1;

              return (
                <li
                  key={account.id}
                  className={`settings-account-item admin-accounts-click-row${
                    selectedAccountId === account.id ? ' is-selected' : ''
                  }`}
                  onDoubleClick={() => openAccountEditor(account)}
                  onKeyDown={(event) => handleAccountRowKeyDown(event, account)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Open editor for ${account.name}`}
                >
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
                      <span>
                        {typeof account.maxBitrateKbps === 'number'
                          ? `Max bitrate ${account.maxBitrateKbps} kbps`
                          : 'Max bitrate from transcoding defaults'}
                      </span>
                    </p>

                    {accountActivity ? (
                      <p className="admin-accounts-row-activity muted">
                        Watching {accountActivity.watching.length} • Download-linked {accountActivity.downloading.length} • Last active {toLastSeenLabel(accountActivity.lastActivityAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="admin-accounts-row-hint">
                    <span className="admin-accounts-edit-chip">Double-click to edit</span>
                    {isLastAdmin ? (
                      <small className="settings-field-hint">Last admin account</small>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {selectedAccount ? (
          <div
            className="admin-accounts-editor-backdrop"
            onClick={closeAccountEditor}
          >
            <article
              className="admin-accounts-editor-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-account-editor-title"
            >
              <header className="admin-accounts-editor-header">
                <div>
                  <p className="settings-section-kicker">User Edit Card</p>
                  <h3 id="admin-account-editor-title">{selectedAccount.name}</h3>
                  <p className="admin-accounts-editor-subtitle">
                    {selectedAccount.email}
                  </p>
                </div>

                <button
                  type="button"
                  className="ghost-button small"
                  onClick={closeAccountEditor}
                >
                  Close
                </button>
              </header>

              <dl className="admin-accounts-editor-meta">
                <div>
                  <dt>Invited By</dt>
                  <dd>{selectedAccount.invitedByName ?? 'Manual creation'}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{toLastSeenLabel(selectedAccount.createdAt)}</dd>
                </div>
                <div>
                  <dt>Last Activity</dt>
                  <dd>{selectedLastActiveLabel}</dd>
                </div>
              </dl>

              <form className="admin-accounts-editor-form" onSubmit={handleSaveAccountEdits}>
                <label className="settings-field">
                  <span className="settings-field-label">Display Name</span>
                  <input
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    minLength={2}
                    maxLength={64}
                    required
                  />
                </label>

                <label className="settings-field">
                  <span className="settings-field-label">Email</span>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(event) => setEditEmail(event.target.value)}
                    required
                  />
                </label>

                <label className="settings-field">
                  <span className="settings-field-label">Role</span>
                  <select
                    value={editRole}
                    onChange={(event) =>
                      setEditRole(
                        event.target.value as 'admin' | 'sailer' | 'user',
                      )
                    }
                  >
                    <option value="user">User</option>
                    <option value="sailer">Sailer</option>
                    <option value="admin">Admin</option>
                  </select>
                  {selectedIsLastAdmin ? (
                    <small className="settings-field-hint">
                      At least one admin account is required.
                    </small>
                  ) : null}
                </label>

                <label className="settings-field">
                  <span className="settings-field-label">Invites Remaining</span>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={editInvites}
                    onChange={(event) => setEditInvites(event.target.value)}
                    disabled={editRole === 'admin'}
                  />
                </label>

                <label className="settings-field settings-field-wide">
                  <span className="settings-field-label">Max Transcode Bitrate (kbps)</span>
                  <input
                    type="number"
                    min={250}
                    max={50000}
                    value={editMaxBitrate}
                    onChange={(event) => setEditMaxBitrate(event.target.value)}
                    placeholder="Default"
                  />
                </label>

                <div className="settings-actions-row admin-accounts-editor-actions settings-field-wide">
                  <button
                    type="submit"
                    className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                    disabled={updatingAccountId === selectedAccount.id}
                  >
                    {updatingAccountId === selectedAccount.id
                      ? 'Saving...'
                      : 'Save Details'}
                  </button>
                </div>
              </form>

              <form
                className="admin-accounts-editor-password-form"
                onSubmit={handleResetPassword}
              >
                <label className="settings-field settings-field-wide">
                  <span className="settings-field-label">Reset Password</span>
                  <input
                    type="password"
                    value={resetPasswordDraft}
                    onChange={(event) => setResetPasswordDraft(event.target.value)}
                    minLength={8}
                    maxLength={72}
                    required
                    placeholder="Set a temporary password"
                  />
                  <small className="settings-field-hint">
                    The user can change this password later in Profile settings.
                  </small>
                </label>

                <div className="settings-actions-row admin-accounts-editor-actions settings-field-wide">
                  <button
                    type="submit"
                    className="ghost-button small"
                    disabled={updatingAccountId === selectedAccount.id}
                  >
                    {updatingAccountId === selectedAccount.id
                      ? 'Updating...'
                      : 'Reset Password'}
                  </button>
                </div>
              </form>

              {editorNotice ? (
                <p className="admin-accounts-editor-notice muted">{editorNotice}</p>
              ) : null}
            </article>
          </div>
        ) : null}
      </article>
    </section>
  );
}
