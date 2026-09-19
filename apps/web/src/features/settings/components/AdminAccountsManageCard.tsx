import { useRef, type FormEvent } from 'react';
import { Pencil, RefreshCw, Search, UserPlus, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  AdminAccountActivityItem,
  AdminManagedAccount,
} from '../../shared/services/types';
import {
  toAccountRoleLabel,
  toLastSeenLabel,
  type AccountRole,
} from './adminAccountsViewUtils';
import { useDialogLayer } from '../../navigation/hooks/useDialogLayer';

interface AdminAccountsManageCardProps {
  accounts: AdminManagedAccount[];
  filteredAccounts: AdminManagedAccount[];
  loadingAccounts: boolean;
  accountQuery: string;
  roleFilter: 'all' | AccountRole;
  adminCount: number;
  activityByAccount: Map<string, AdminAccountActivityItem>;
  selectedAccount: AdminManagedAccount | null;
  selectedIsLastAdmin: boolean;
  selectedLastActiveLabel: string;
  editName: string;
  editEmail: string;
  editRole: AccountRole;
  editInvites: string;
  editMaxBitrate: string;
  resetPasswordDraft: string;
  updatingAccountId: string | null;
  editorNotice: string | null;
  accountsMessage: string | null;
  accountsError: string | null;
  onAccountQueryChange: (value: string) => void;
  onRoleFilterChange: (value: 'all' | AccountRole) => void;
  onOpenAccountEditor: (account: AdminManagedAccount) => void;
  onOpenCreateAccount: () => void;
  onRefreshAccounts: () => Promise<void>;
  onCloseAccountEditor: () => void;
  onEditNameChange: (value: string) => void;
  onEditEmailChange: (value: string) => void;
  onEditRoleChange: (value: AccountRole) => void;
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
  accountsMessage,
  accountsError,
  onAccountQueryChange,
  onRoleFilterChange,
  onOpenAccountEditor,
  onOpenCreateAccount,
  onRefreshAccounts,
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
    <Card className="settings-surface settings-profile-card admin-accounts-manage-card !col-span-12">
      <CardHeader className="settings-surface-header gap-4 p-0">
        <div>
          <p className="settings-section-kicker">Account directory</p>
          <CardTitle>Accounts & Access</CardTitle>
          <CardDescription>
            Find an Account, review its access, or create a new login identity.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onRefreshAccounts()}
            disabled={loadingAccounts}
          >
            <RefreshCw className={loadingAccounts ? 'animate-spin' : ''} aria-hidden="true" />
            Refresh
          </Button>
          <Button type="button" size="sm" onClick={onOpenCreateAccount}>
            <UserPlus aria-hidden="true" />
            Add Account
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {accountsMessage ? (
          <Alert className="mb-3" role="status">
            <AlertTitle>Account updated</AlertTitle>
            <AlertDescription>{accountsMessage}</AlertDescription>
          </Alert>
        ) : null}
        {accountsError && !editorOpen ? (
          <Alert className="mb-3" variant="destructive" role="alert">
            <AlertTitle>Account action failed</AlertTitle>
            <AlertDescription>{accountsError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="admin-accounts-toolbar-compact">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              className="admin-accounts-search-input-compact pl-9"
              type="search"
              value={accountQuery}
              onChange={(event) => onAccountQueryChange(event.target.value)}
              placeholder="Search Accounts"
              aria-label="Search Accounts by name, email, or inviter"
            />
          </div>

          <select
            className="admin-accounts-role-select-compact"
            value={roleFilter}
            onChange={(event) => onRoleFilterChange(event.target.value as 'all' | AccountRole)}
            aria-label="Filter Accounts by role"
          >
            <option value="all">All roles</option>
            <option value="admin">Administrators</option>
            <option value="sailer">Downloaders</option>
            <option value="user">Standard Accounts</option>
          </select>

          <Badge variant="secondary" aria-live="polite">
            {loadingAccounts
              ? 'Loading…'
              : `${filteredAccounts.length} of ${accounts.length}`}
          </Badge>
        </div>

        {loadingAccounts ? (
          <div className="mt-4 grid gap-2" aria-label="Loading Account directory">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : filteredAccounts.length === 0 ? (
          <p className="muted admin-accounts-empty-state">
            No Accounts match this search and role filter.
          </p>
        ) : (
          <ul className="settings-account-list admin-accounts-click-list">
            {filteredAccounts.map((account) => {
              const accountActivity = activityByAccount.get(account.id) ?? null;
              const isLastAdmin = account.role === 'admin' && adminCount <= 1;

              return (
                <li key={account.id} className="settings-account-item admin-accounts-click-row">
                  <button
                    type="button"
                    className="settings-account-main border-0 bg-transparent p-0 text-left text-inherit"
                    onClick={() => onOpenAccountEditor(account)}
                    aria-label={`Edit Account ${account.name}`}
                  >
                    <span className="settings-account-header-line">
                      <span className="settings-account-name">{account.name}</span>
                      <Badge variant="outline">{toAccountRoleLabel(account.role)}</Badge>
                    </span>
                    <span className="settings-account-meta">{account.email}</span>
                    <span className="settings-account-submeta">
                      <span>{account.invitedByName ? `Invited by ${account.invitedByName}` : 'Created manually'}</span>
                      <span>{account.role === 'admin' ? 'Unlimited Account Invites' : `${Math.max(0, account.invitesRemaining ?? 0)} Account Invites remaining`}</span>
                      <span>{typeof account.maxBitrateKbps === 'number' ? `Max bitrate ${account.maxBitrateKbps} kbps` : 'System bitrate default'}</span>
                    </span>
                    {accountActivity ? (
                      <span className="admin-accounts-row-activity muted">
                        {accountActivity.inProgressCount} in progress · Last activity {toLastSeenLabel(accountActivity.lastActivityAt)}
                      </span>
                    ) : null}
                  </button>

                  <div className="admin-accounts-row-hint">
                    <Button type="button" variant="outline" size="sm" onClick={() => onOpenAccountEditor(account)}>
                      <Pencil aria-hidden="true" />
                      Edit
                    </Button>
                    {isLastAdmin ? <small className="settings-field-hint">Last Administrator</small> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      {selectedAccount ? (
        <div className="admin-accounts-editor-backdrop" onClick={onCloseAccountEditor}>
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
                <p className="settings-section-kicker">Account details</p>
                <h3 id="admin-account-editor-title">{selectedAccount.name}</h3>
                <p className="admin-accounts-editor-subtitle">{selectedAccount.email}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={onCloseAccountEditor} aria-label="Close Account editor">
                <X aria-hidden="true" />
              </Button>
            </header>

            <dl className="admin-accounts-editor-meta">
              <div><dt>Invited by</dt><dd>{selectedAccount.invitedByName ?? 'Manual creation'}</dd></div>
              <div><dt>Created</dt><dd>{toLastSeenLabel(selectedAccount.createdAt)}</dd></div>
              <div><dt>Last activity</dt><dd>{selectedLastActiveLabel}</dd></div>
            </dl>

            <Separator />

            <form className="admin-accounts-editor-form" onSubmit={onSaveAccountEdits}>
              <Label className="settings-field">
                <span className="settings-field-label">Display Name</span>
                <Input type="text" value={editName} onChange={(event) => onEditNameChange(event.target.value)} minLength={2} maxLength={64} required />
              </Label>
              <Label className="settings-field">
                <span className="settings-field-label">Email</span>
                <Input type="email" value={editEmail} onChange={(event) => onEditEmailChange(event.target.value)} required />
              </Label>
              <Label className="settings-field">
                <span className="settings-field-label">Account Role</span>
                <select value={editRole} onChange={(event) => onEditRoleChange(event.target.value as AccountRole)}>
                  <option value="user">Standard Account</option>
                  <option value="sailer">Downloader</option>
                  <option value="admin">Administrator</option>
                </select>
                {selectedIsLastAdmin ? <small className="settings-field-hint">At least one Administrator is required.</small> : null}
              </Label>
              <Label className="settings-field">
                <span className="settings-field-label">Account Invites Remaining</span>
                <Input type="number" min={0} max={100000} value={editInvites} onChange={(event) => onEditInvitesChange(event.target.value)} disabled={editRole === 'admin'} />
              </Label>
              <Label className="settings-field settings-field-wide">
                <span className="settings-field-label">Max Transcode Bitrate (kbps)</span>
                <Input type="number" min={250} max={50000} value={editMaxBitrate} onChange={(event) => onEditMaxBitrateChange(event.target.value)} placeholder="Use system default" />
              </Label>
              <div className="settings-actions-row admin-accounts-editor-actions settings-field-wide">
                <Button type="submit" disabled={updatingAccountId === selectedAccount.id}>
                  {updatingAccountId === selectedAccount.id ? 'Saving…' : 'Save Account'}
                </Button>
              </div>
            </form>

            <Separator />

            <form className="admin-accounts-editor-password-form" onSubmit={onResetPassword}>
              <Label className="settings-field settings-field-wide">
                <span className="settings-field-label">Reset Password</span>
                <Input type="password" value={resetPasswordDraft} onChange={(event) => onResetPasswordDraftChange(event.target.value)} minLength={8} maxLength={72} required placeholder="Set a temporary password" />
                <small className="settings-field-hint">The Account can change this later in Profile settings.</small>
              </Label>
              <div className="settings-actions-row admin-accounts-editor-actions settings-field-wide">
                <Button type="submit" variant="outline" disabled={updatingAccountId === selectedAccount.id}>
                  {updatingAccountId === selectedAccount.id ? 'Updating…' : 'Reset Password'}
                </Button>
              </div>
            </form>

            {accountsError ? (
              <Alert variant="destructive" role="alert">
                <AlertTitle>Account was not updated</AlertTitle>
                <AlertDescription>{accountsError}</AlertDescription>
              </Alert>
            ) : null}
            {editorNotice ? <p className="admin-accounts-editor-notice muted" role="status">{editorNotice}</p> : null}
          </article>
        </div>
      ) : null}
    </Card>
  );
}
