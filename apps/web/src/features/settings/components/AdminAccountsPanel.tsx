import {
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import type { AdminAccountsState } from '../services/useAdminAccounts';
import type { AdminManagedAccount } from '../../shared/services/types';
import { AdminAccountsActivityCard } from './AdminAccountsActivityCard';
import { AdminAccountsManageCard } from './AdminAccountsManageCard';
import { AdminAccountsSummaryCard } from './AdminAccountsSummaryCard';
import { AdminAccountCreateDialog } from './AdminAccountCreateDialog';
import {
  normalizeBitrateInput,
  normalizeInvitesInput,
  toLastSeenLabel,
} from './adminAccountsViewUtils';

interface AdminAccountsPanelProps {
  adminAccountsState: AdminAccountsState;
}

function accountEditValidation(
  account: AdminManagedAccount | null,
  isLastAdmin: boolean,
  role: 'admin' | 'sailer' | 'user',
  name: string,
  email: string,
): string | null {
  if (!account) return 'Select an account to edit.';
  if (!name || !email) return 'Name and email are required.';
  if (isLastAdmin && role !== 'admin') return 'At least one admin account is required.';
  return null;
}

export function AdminAccountsPanel({
  adminAccountsState,
}: AdminAccountsPanelProps) {
  const {
    accounts,
    activityOverview,
    loadingAccounts,
    loadingActivity,
    creatingAccount,
    updatingAccountId,
    accountsMessage,
    accountsError,
    activityError,
    refreshAccounts,
    refreshActivity,
    createAccount,
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
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'sailer' | 'user'>('user');
  const [editInvites, setEditInvites] = useState('0');
  const [editMaxBitrate, setEditMaxBitrate] = useState('');
  const [resetPasswordDraft, setResetPasswordDraft] = useState('');
  const [editorNotice, setEditorNotice] = useState<string | null>(null);

  const adminCount = useMemo(
    () => accounts.filter((account) => account.role === 'admin').length,
    [accounts],
  );
  const sailerCount = useMemo(
    () => accounts.filter((account) => account.role === 'sailer').length,
    [accounts],
  );
  const userCount = accounts.length - adminCount - sailerCount;
  const activitySummary = activityOverview?.summary ?? null;
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

  function openAccountEditor(account: AdminManagedAccount) {
    setSelectedAccountId(account.id);
    setEditName(account.name);
    setEditEmail(account.email);
    setEditRole(account.role);
    setEditInvites(String(Math.max(0, account.invitesRemaining ?? 0)));
    setEditMaxBitrate(
      typeof account.maxBitrateKbps === 'number'
        ? String(account.maxBitrateKbps)
        : '',
    );
    setResetPasswordDraft('');
    setEditorNotice(null);
  }

  function closeAccountEditor() {
    setSelectedAccountId(null);
  }

  async function handleSaveAccountEdits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = editName.trim();
    const normalizedEmail = editEmail.trim().toLowerCase();
    const validationError = accountEditValidation(
      selectedAccount,
      selectedIsLastAdmin,
      editRole,
      normalizedName,
      normalizedEmail,
    );
    if (validationError) {
      setEditorNotice(validationError);
      return;
    }
    const account = selectedAccount as AdminManagedAccount;

    const currentEmail = account.email.trim().toLowerCase();
    const currentName = account.name.trim();
    const currentRole = account.role;
    const currentInvites = Math.max(0, account.invitesRemaining ?? 0);
    const currentMaxBitrate =
      typeof account.maxBitrateKbps === 'number'
        ? Math.max(250, Math.min(50000, account.maxBitrateKbps))
        : null;

    const nextInvites = normalizeInvitesInput(editInvites);
    const nextMaxBitrate = normalizeBitrateInput(editMaxBitrate);
    let savedAny = false;

    if (normalizedName !== currentName || normalizedEmail !== currentEmail) {
      const saved = await updateAccountProfile(account.id, {
        email: normalizedEmail,
        name: normalizedName,
      });
      if (!saved) {
        return;
      }

      savedAny = true;
    }

    if (editRole !== currentRole) {
      const saved = await setAccountRole(account.id, editRole);
      if (!saved) {
        return;
      }

      savedAny = true;
    }

    if (editRole !== 'admin' && nextInvites !== currentInvites) {
      const saved = await setAccountInvites(account.id, nextInvites);
      if (!saved) {
        return;
      }
      savedAny = true;
    }

    if (nextMaxBitrate !== currentMaxBitrate) {
      const saved = await setAccountMaxBitrate(account.id, nextMaxBitrate);
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
    <section className="settings-content-grid admin-accounts-layout" data-tv-focus-zone="shelf">
      <AdminAccountsManageCard
        accounts={accounts}
        filteredAccounts={filteredAccounts}
        loadingAccounts={loadingAccounts}
        accountQuery={accountQuery}
        roleFilter={roleFilter}
        adminCount={adminCount}
        activityByAccount={activityByAccount}
        selectedAccount={selectedAccount}
        selectedIsLastAdmin={selectedIsLastAdmin}
        selectedLastActiveLabel={selectedLastActiveLabel}
        editName={editName}
        editEmail={editEmail}
        editRole={editRole}
        editInvites={editInvites}
        editMaxBitrate={editMaxBitrate}
        resetPasswordDraft={resetPasswordDraft}
        updatingAccountId={updatingAccountId}
        editorNotice={editorNotice}
        accountsMessage={accountsMessage}
        accountsError={accountsError}
        onAccountQueryChange={setAccountQuery}
        onRoleFilterChange={setRoleFilter}
        onOpenAccountEditor={openAccountEditor}
        onOpenCreateAccount={() => setCreateDialogOpen(true)}
        onRefreshAccounts={refreshAccounts}
        onCloseAccountEditor={closeAccountEditor}
        onEditNameChange={setEditName}
        onEditEmailChange={setEditEmail}
        onEditRoleChange={setEditRole}
        onEditInvitesChange={setEditInvites}
        onEditMaxBitrateChange={setEditMaxBitrate}
        onResetPasswordDraftChange={setResetPasswordDraft}
        onSaveAccountEdits={handleSaveAccountEdits}
        onResetPassword={handleResetPassword}
      />

      <AdminAccountsActivityCard
        loadingActivity={loadingActivity}
        activityError={activityError}
        activityAsOf={activityOverview?.asOf ?? null}
        activeAccountActivity={activeAccountActivity}
        accountsById={accountsById}
        activityDownloads={activityDownloads}
        onRefresh={refreshActivity}
      />

      <AdminAccountsSummaryCard
        accountsCount={accounts.length}
        adminCount={adminCount}
        sailerCount={sailerCount}
        userCount={userCount}
        activeDownloadCount={activeDownloadCount}
        recentlyActiveCount={recentlyActiveCount}
      />

      <AdminAccountCreateDialog
        open={createDialogOpen}
        creating={creatingAccount}
        error={accountsError}
        onClose={() => setCreateDialogOpen(false)}
        onCreate={createAccount}
      />
    </section>
  );
}
