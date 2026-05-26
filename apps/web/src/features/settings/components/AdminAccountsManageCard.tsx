import {
  useRef,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type {
  AdminAccountActivityItem,
  AdminManagedAccount,
} from '../../shared/services/types';
import { toLastSeenLabel } from './adminAccountsViewUtils';
import { useDialogLayer } from '../../navigation/hooks/useDialogLayer';

interface AdminAccountsManageCardProps {
  accounts: AdminManagedAccount[];
  filteredAccounts: AdminManagedAccount[];
  loadingAccounts: boolean;
  accountQuery: string;
  roleFilter: 'all' | 'admin' | 'sailer' | 'user';
  selectedAccountId: string | null;
  adminCount: number;
  activityByAccount: Map<string, AdminAccountActivityItem>;
  selectedAccount: AdminManagedAccount | null;
  selectedIsLastAdmin: boolean;
  selectedLastActiveLabel: string;
  editName: string;
  editEmail: string;
  editRole: 'admin' | 'sailer' | 'user';
  editInvites: string;
  editMaxBitrate: string;
  resetPasswordDraft: string;
  updatingAccountId: string | null;
  editorNotice: string | null;
  onAccountQueryChange: (value: string) => void;
  onRoleFilterChange: (value: 'all' | 'admin' | 'sailer' | 'user') => void;
  onOpenAccountEditor: (account: AdminManagedAccount) => void;
  onAccountRowKeyDown: (
    event: ReactKeyboardEvent<HTMLLIElement>,
    account: AdminManagedAccount,
  ) => void;
  onCloseAccountEditor: () => void;
  onEditNameChange: (value: string) => void;
  onEditEmailChange: (value: string) => void;
  onEditRoleChange: (value: 'admin' | 'sailer' | 'user') => void;
  onEditInvitesChange: (value: string) => void;
  onEditMaxBitrateChange: (value: string) => void;
  onResetPasswordDraftChange: (value: string) => void;
  onSaveAccountEdits: (event: FormEvent<HTMLFormElement>) => void;
  onResetPassword: (event: FormEvent<HTMLFormElement>) => void;
}

export function AdminAccountsManageCard({
  accounts,
  filteredAccounts,
  loadingAccounts,
  accountQuery,
  roleFilter,
  selectedAccountId,
  adminCount,
  activityByAccount,
  selectedAccount,
  selectedIsLastAdmin,
  selectedLastActiveLabel,
  editName,
  editEmail,
  editRole,
  editInvites,
  editMaxBitrate,
  resetPasswordDraft,
  updatingAccountId,
  editorNotice,
  onAccountQueryChange,
  onRoleFilterChange,
  onOpenAccountEditor,
  onAccountRowKeyDown,
  onCloseAccountEditor,
  onEditNameChange,
  onEditEmailChange,
  onEditRoleChange,
  onEditInvitesChange,
  onEditMaxBitrateChange,
  onResetPasswordDraftChange,
  onSaveAccountEdits,
  onResetPassword,
}: AdminAccountsManageCardProps) {
  const accountEditorRef = useRef<HTMLElement | null>(null);
  const editorOpen = selectedAccount !== null;

  useDialogLayer({
    open: editorOpen,
    containerRef: accountEditorRef,
    onRequestClose: onCloseAccountEditor,
    initialFocusSelector: 'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
  });

  return (
    <article className="settings-surface settings-profile-card admin-accounts-manage-card">
      <header className="settings-surface-header">
        <div>
          <p className="settings-section-kicker">Invite Balances</p>
          <h2>Manage Accounts</h2>
        </div>
        <span className="settings-pill">
          {loadingAccounts ? 'Loading' : `${filteredAccounts.length} of ${accounts.length}`}
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
          onChange={(event) => onAccountQueryChange(event.target.value)}
          placeholder="Search accounts"
          aria-label="Search accounts by name, email, or inviter"
        />

        <select
          className="admin-accounts-role-select-compact"
          value={roleFilter}
          onChange={(event) =>
            onRoleFilterChange(
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
                onDoubleClick={() => onOpenAccountEditor(account)}
                onKeyDown={(event) => onAccountRowKeyDown(event, account)}
                tabIndex={0}
                role="button"
                aria-label={`Open editor for ${account.name}`}
              >
                <div className="settings-account-main">
                  <div className="settings-account-header-line">
                    <p className="settings-account-name">{account.name}</p>
                    <span className={`settings-account-role-badge is-${account.role}`}>
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
          onClick={onCloseAccountEditor}
        >
          <article
            ref={accountEditorRef}
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
                onClick={onCloseAccountEditor}
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

            <form className="admin-accounts-editor-form" onSubmit={onSaveAccountEdits}>
              <label className="settings-field">
                <span className="settings-field-label">Display Name</span>
                <input
                  type="text"
                  value={editName}
                  onChange={(event) => onEditNameChange(event.target.value)}
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
                  onChange={(event) => onEditEmailChange(event.target.value)}
                  required
                />
              </label>

              <label className="settings-field">
                <span className="settings-field-label">Role</span>
                <select
                  value={editRole}
                  onChange={(event) =>
                    onEditRoleChange(
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
                  onChange={(event) => onEditInvitesChange(event.target.value)}
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
                  onChange={(event) => onEditMaxBitrateChange(event.target.value)}
                  placeholder="Default"
                />
              </label>

              <div className="settings-actions-row admin-accounts-editor-actions settings-field-wide">
                <button
                  type="submit"
                  className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                  disabled={updatingAccountId === selectedAccount.id}
                >
                  {updatingAccountId === selectedAccount.id ? 'Saving...' : 'Save Details'}
                </button>
              </div>
            </form>

            <form
              className="admin-accounts-editor-password-form"
              onSubmit={onResetPassword}
            >
              <label className="settings-field settings-field-wide">
                <span className="settings-field-label">Reset Password</span>
                <input
                  type="password"
                  value={resetPasswordDraft}
                  onChange={(event) => onResetPasswordDraftChange(event.target.value)}
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
                  {updatingAccountId === selectedAccount.id ? 'Updating...' : 'Reset Password'}
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
  );
}
