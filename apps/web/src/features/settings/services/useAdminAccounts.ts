import { useCallback, useEffect, useState } from 'react';
import {
  createAdminAccount,
  listAdminAccounts,
  listAdminAccountsActivity,
  resetAdminAccountPassword,
  toApiErrorMessage,
  updateAdminAccountProfile,
  updateAdminAccountInvites,
  updateAdminAccountMaxBitrate,
  updateAdminAccountRole,
} from '../../shared/services/api';
import type {
  AdminAccountsActivityOverview,
  AdminManagedAccount,
} from '../../shared/services/types';

export interface AdminAccountsState {
  accounts: AdminManagedAccount[];
  activityOverview: AdminAccountsActivityOverview | null;
  loadingAccounts: boolean;
  loadingActivity: boolean;
  creatingAccount: boolean;
  updatingAccountId: string | null;
  accountsMessage: string | null;
  accountsError: string | null;
  activityError: string | null;
  refreshAccounts: () => Promise<void>;
  refreshActivity: () => Promise<void>;
  createAccount: (input: {
    email: string;
    name: string;
    password: string;
    role?: 'admin' | 'sailer' | 'user';
    invitesRemaining?: number;
    maxBitrateKbps?: number | null;
  }) => Promise<boolean>;
  setAccountInvites: (
    accountId: string,
    invitesRemaining: number,
  ) => Promise<boolean>;
  setAccountMaxBitrate: (
    accountId: string,
    maxBitrateKbps: number | null,
  ) => Promise<boolean>;
  setAccountRole: (
    accountId: string,
    role: 'admin' | 'sailer' | 'user',
  ) => Promise<boolean>;
  updateAccountProfile: (
    accountId: string,
    input: {
      email: string;
      name: string;
    },
  ) => Promise<boolean>;
  resetAccountPassword: (
    accountId: string,
    newPassword: string,
  ) => Promise<boolean>;
}

export function useAdminAccounts(
  token: string,
  enabled: boolean,
): AdminAccountsState {
  const [accounts, setAccounts] = useState<AdminManagedAccount[]>([]);
  const [activityOverview, setActivityOverview] =
    useState<AdminAccountsActivityOverview | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [updatingAccountId, setUpdatingAccountId] = useState<string | null>(null);
  const [accountsMessage, setAccountsMessage] = useState<string | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoadingAccounts(true);
    setAccountsError(null);

    try {
      const response = await listAdminAccounts(token);
      setAccounts(response.accounts);
    } catch (loadFailure) {
      setAccountsError(toApiErrorMessage(loadFailure, 'Failed to load accounts.'));
    } finally {
      setLoadingAccounts(false);
    }
  }, [enabled, token]);

  const refreshActivity = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setLoadingActivity(true);
    setActivityError(null);

    try {
      const response = await listAdminAccountsActivity(token);
      setActivityOverview(response);
    } catch (loadFailure) {
      setActivityError(
        toApiErrorMessage(loadFailure, 'Failed to load account activity.'),
      );
      setActivityOverview(null);
    } finally {
      setLoadingActivity(false);
    }
  }, [enabled, token]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void Promise.all([refreshAccounts(), refreshActivity()]);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [enabled, refreshAccounts, refreshActivity]);

  async function createAccountAction(input: {
    email: string;
    name: string;
    password: string;
    role?: 'admin' | 'sailer' | 'user';
    invitesRemaining?: number;
    maxBitrateKbps?: number | null;
  }) {
    if (!enabled) {
      return false;
    }

    setCreatingAccount(true);
    setAccountsError(null);
    setAccountsMessage(null);

    try {
      await createAdminAccount(token, input);
      await Promise.all([refreshAccounts(), refreshActivity()]);
      setAccountsMessage('Account created successfully.');
      return true;
    } catch (createFailure) {
      setAccountsError(
        toApiErrorMessage(createFailure, 'Failed to create account.'),
      );
      return false;
    } finally {
      setCreatingAccount(false);
    }
  }

  async function setAccountInvitesAction(
    accountId: string,
    invitesRemaining: number,
  ) {
    if (!enabled) {
      return false;
    }

    setUpdatingAccountId(accountId);
    setAccountsError(null);
    setAccountsMessage(null);

    try {
      const updated = await updateAdminAccountInvites(
        token,
        accountId,
        invitesRemaining,
      );

      setAccounts((previous) =>
        previous.map((account) =>
          account.id === updated.id ? { ...account, ...updated } : account,
        ),
      );
      void refreshActivity();
      setAccountsMessage('Invite balance updated.');
      return true;
    } catch (updateFailure) {
      setAccountsError(
        toApiErrorMessage(updateFailure, 'Failed to update invites.'),
      );
      return false;
    } finally {
      setUpdatingAccountId(null);
    }
  }

  async function setAccountRoleAction(
    accountId: string,
    role: 'admin' | 'sailer' | 'user',
  ) {
    if (!enabled) {
      return false;
    }

    setUpdatingAccountId(accountId);
    setAccountsError(null);
    setAccountsMessage(null);

    try {
      const updated = await updateAdminAccountRole(token, accountId, role);

      setAccounts((previous) =>
        previous.map((account) =>
          account.id === updated.id ? { ...account, ...updated } : account,
        ),
      );
      void refreshActivity();
      setAccountsMessage('Account role updated.');
      return true;
    } catch (updateFailure) {
      setAccountsError(toApiErrorMessage(updateFailure, 'Failed to update role.'));
      return false;
    } finally {
      setUpdatingAccountId(null);
    }
  }

  async function setAccountMaxBitrateAction(
    accountId: string,
    maxBitrateKbps: number | null,
  ) {
    if (!enabled) {
      return false;
    }

    setUpdatingAccountId(accountId);
    setAccountsError(null);
    setAccountsMessage(null);

    try {
      const updated = await updateAdminAccountMaxBitrate(
        token,
        accountId,
        maxBitrateKbps,
      );

      setAccounts((previous) =>
        previous.map((account) =>
          account.id === updated.id ? { ...account, ...updated } : account,
        ),
      );
      void refreshActivity();
      setAccountsMessage('Max bitrate updated.');
      return true;
    } catch (updateFailure) {
      setAccountsError(
        toApiErrorMessage(updateFailure, 'Failed to update max bitrate.'),
      );
      return false;
    } finally {
      setUpdatingAccountId(null);
    }
  }

  async function updateAccountProfileAction(
    accountId: string,
    input: {
      email: string;
      name: string;
    },
  ) {
    if (!enabled) {
      return false;
    }

    setUpdatingAccountId(accountId);
    setAccountsError(null);
    setAccountsMessage(null);

    try {
      const updated = await updateAdminAccountProfile(token, accountId, input);

      setAccounts((previous) =>
        previous.map((account) =>
          account.id === updated.id ? { ...account, ...updated } : account,
        ),
      );
      setAccountsMessage('Account details updated.');
      return true;
    } catch (updateFailure) {
      setAccountsError(
        toApiErrorMessage(updateFailure, 'Failed to update account details.'),
      );
      return false;
    } finally {
      setUpdatingAccountId(null);
    }
  }

  async function resetAccountPasswordAction(
    accountId: string,
    newPassword: string,
  ) {
    if (!enabled) {
      return false;
    }

    setUpdatingAccountId(accountId);
    setAccountsError(null);
    setAccountsMessage(null);

    try {
      await resetAdminAccountPassword(token, accountId, { newPassword });
      setAccountsMessage('Account password reset.');
      return true;
    } catch (updateFailure) {
      setAccountsError(
        toApiErrorMessage(updateFailure, 'Failed to reset password.'),
      );
      return false;
    } finally {
      setUpdatingAccountId(null);
    }
  }

  return {
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
    createAccount: createAccountAction,
    setAccountInvites: setAccountInvitesAction,
    setAccountMaxBitrate: setAccountMaxBitrateAction,
    setAccountRole: setAccountRoleAction,
    updateAccountProfile: updateAccountProfileAction,
    resetAccountPassword: resetAccountPasswordAction,
  };
}
