import { useCallback, useEffect, useState } from 'react';
import {
  createAdminAccount,
  listAdminAccounts,
  toApiErrorMessage,
  updateAdminAccountInvites,
  updateAdminAccountRole,
} from '../../shared/services/api';
import type { AdminManagedAccount } from '../../shared/services/types';

export interface AdminAccountsState {
  accounts: AdminManagedAccount[];
  loadingAccounts: boolean;
  creatingAccount: boolean;
  updatingAccountId: string | null;
  accountsMessage: string | null;
  accountsError: string | null;
  refreshAccounts: () => Promise<void>;
  createAccount: (input: {
    email: string;
    name: string;
    password: string;
    role?: 'admin' | 'sailer' | 'user';
    invitesRemaining?: number;
  }) => Promise<boolean>;
  setAccountInvites: (
    accountId: string,
    invitesRemaining: number,
  ) => Promise<boolean>;
  setAccountRole: (
    accountId: string,
    role: 'admin' | 'sailer' | 'user',
  ) => Promise<boolean>;
}

export function useAdminAccounts(
  token: string,
  enabled: boolean,
): AdminAccountsState {
  const [accounts, setAccounts] = useState<AdminManagedAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [updatingAccountId, setUpdatingAccountId] = useState<string | null>(null);
  const [accountsMessage, setAccountsMessage] = useState<string | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

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

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!enabled) {
      return;
    }

    void refreshAccounts();
  }, [enabled, refreshAccounts]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function createAccountAction(input: {
    email: string;
    name: string;
    password: string;
    role?: 'admin' | 'sailer' | 'user';
    invitesRemaining?: number;
  }) {
    if (!enabled) {
      return false;
    }

    setCreatingAccount(true);
    setAccountsError(null);
    setAccountsMessage(null);

    try {
      await createAdminAccount(token, input);
      await refreshAccounts();
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
      setAccountsMessage('Account role updated.');
      return true;
    } catch (updateFailure) {
      setAccountsError(toApiErrorMessage(updateFailure, 'Failed to update role.'));
      return false;
    } finally {
      setUpdatingAccountId(null);
    }
  }

  return {
    accounts,
    loadingAccounts,
    creatingAccount,
    updatingAccountId,
    accountsMessage,
    accountsError,
    refreshAccounts,
    createAccount: createAccountAction,
    setAccountInvites: setAccountInvitesAction,
    setAccountRole: setAccountRoleAction,
  };
}
