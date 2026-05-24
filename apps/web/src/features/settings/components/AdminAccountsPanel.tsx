import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type { AdminAccountsState } from '../services/useAdminAccounts';
import type { AdminManagedAccount } from '../../shared/services/types';
import { AdminAccountsActivityCard } from './AdminAccountsActivityCard';
import { AdminAccountsManageCard } from './AdminAccountsManageCard';
import { AdminAccountsSummaryCard } from './AdminAccountsSummaryCard';
import {
  normalizeBitrateInput,
  normalizeInvitesInput,
  toLastSeenLabel,
} from './adminAccountsViewUtils';

interface AdminAccountsPanelProps {
  adminAccountsState: AdminAccountsState;
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
      <AdminAccountsSummaryCard
        accountsCount={accounts.length}
        adminCount={adminCount}
        sailerCount={sailerCount}
        userCount={userCount}
        totalInvites={totalInvites}
        customBitrateCount={customBitrateCount}
        activeAccountCount={activeAccountCount}
        activeWatcherCount={activeWatcherCount}
        activeDownloadCount={activeDownloadCount}
        recentlyActiveCount={recentlyActiveCount}
        accountsMessage={accountsMessage}
        accountsError={accountsError}
      />

      <AdminAccountsActivityCard
        loadingActivity={loadingActivity}
        activeAccountActivity={activeAccountActivity}
        accountsById={accountsById}
        activityDownloads={activityDownloads}
      />

      <AdminAccountsManageCard
        accounts={accounts}
        filteredAccounts={filteredAccounts}
        loadingAccounts={loadingAccounts}
        accountQuery={accountQuery}
        roleFilter={roleFilter}
        selectedAccountId={selectedAccountId}
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
        onAccountQueryChange={setAccountQuery}
        onRoleFilterChange={setRoleFilter}
        onOpenAccountEditor={openAccountEditor}
        onAccountRowKeyDown={handleAccountRowKeyDown}
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
    </section>
  );
}
