import type {
  AdminAccountsActivityOverview,
  AdminManagedAccount,
  AuthResponse,
  CreatedInvite,
  InviteStatus,
  TvPairingClaimRequest,
  TvPairingClaimResponse,
  TvPairingPollRequest,
  TvPairingPollResponse,
  TvPairingStartRequest,
  TvPairingStartResponse,
  User,
} from './types';
import { jsonBody, request } from './api-core';

export async function register(input: {
  email: string;
  name: string;
  password: string;
  inviteToken: string;
}) {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: jsonBody(input),
  });
}

export async function login(input: { email: string; password: string }) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: jsonBody(input),
  });
}

export async function requestPasswordReset(input: { email: string }) {
  return request<{
    message: string;
    resetPath: string | null;
    expiresAt: string | null;
  }>('/auth/password-reset/request', {
    method: 'POST',
    body: jsonBody(input),
  });
}

export async function confirmPasswordReset(input: {
  token: string;
  newPassword: string;
}) {
  return request<{ message: string }>('/auth/password-reset/confirm', {
    method: 'POST',
    body: jsonBody(input),
  });
}

export async function requestTvPairingCode(
  input: TvPairingStartRequest = {},
) {
  return request<TvPairingStartResponse>('/auth/tv/pairings', {
    method: 'POST',
    body: jsonBody(input),
  });
}

export async function claimTvPairingCode(
  token: string,
  input: TvPairingClaimRequest,
) {
  return request<TvPairingClaimResponse>(
    '/auth/tv/pairings/claim',
    {
      method: 'POST',
      body: jsonBody(input),
    },
    token,
  );
}

export async function pollTvPairingStatus(
  pairingId: string,
  input: TvPairingPollRequest,
) {
  return request<TvPairingPollResponse>(
    `/auth/tv/pairings/${encodeURIComponent(pairingId)}/status`,
    {
      method: 'POST',
      body: jsonBody(input),
    },
  );
}

export async function getInviteStatus(inviteToken: string) {
  const encodedToken = encodeURIComponent(inviteToken.trim());
  return request<InviteStatus>(`/auth/invites/${encodedToken}`);
}

export async function createInviteLink(token: string) {
  return request<CreatedInvite>(
    '/auth/invites',
    {
      method: 'POST',
    },
    token,
  );
}

export async function listAdminAccounts(token: string) {
  return request<{ accounts: AdminManagedAccount[] }>(
    '/auth/admin/accounts',
    {},
    token,
  );
}

export async function listAdminAccountsActivity(token: string) {
  return request<AdminAccountsActivityOverview>(
    '/auth/admin/accounts/activity',
    {},
    token,
  );
}

export async function updateAdminAccountInvites(
  token: string,
  accountId: string,
  invitesRemaining: number,
) {
  return request<AdminManagedAccount>(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/invites`,
    {
      method: 'PATCH',
      body: jsonBody({ invitesRemaining }),
    },
    token,
  );
}

export async function updateAdminAccountRole(
  token: string,
  accountId: string,
  role: 'admin' | 'sailer' | 'user',
) {
  return request<AdminManagedAccount>(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/role`,
    {
      method: 'PATCH',
      body: jsonBody({ role }),
    },
    token,
  );
}

export async function updateAdminAccountMaxBitrate(
  token: string,
  accountId: string,
  maxBitrateKbps: number | null,
) {
  return request<AdminManagedAccount>(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/max-bitrate`,
    {
      method: 'PATCH',
      body: jsonBody({ maxBitrateKbps }),
    },
    token,
  );
}

export async function updateAdminAccountProfile(
  token: string,
  accountId: string,
  input: {
    email: string;
    name: string;
  },
) {
  return request<AdminManagedAccount>(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/profile`,
    {
      method: 'PATCH',
      body: jsonBody(input),
    },
    token,
  );
}

export async function resetAdminAccountPassword(
  token: string,
  accountId: string,
  input: {
    newPassword: string;
  },
) {
  return request<{ message: string }>(
    `/auth/admin/accounts/${encodeURIComponent(accountId)}/password/reset`,
    {
      method: 'POST',
      body: jsonBody(input),
    },
    token,
  );
}

export async function createAdminAccount(
  token: string,
  input: {
    email: string;
    name: string;
    password: string;
    role?: 'admin' | 'sailer' | 'user';
    invitesRemaining?: number;
    maxBitrateKbps?: number | null;
  },
) {
  return request<AdminManagedAccount>(
    '/auth/admin/accounts',
    {
      method: 'POST',
      body: jsonBody(input),
    },
    token,
  );
}

export async function me(token: string) {
  return request<User>('/auth/me', {}, token);
}

export async function refreshSession(token: string) {
  return request<AuthResponse>(
    '/auth/refresh',
    { method: 'POST' },
    token,
  );
}

export async function updateMyProfile(
  token: string,
  input: {
    email: string;
    name: string;
  },
) {
  return request<User>(
    '/auth/me',
    {
      method: 'PATCH',
      body: jsonBody(input),
    },
    token,
  );
}

export async function changeMyPassword(
  token: string,
  input: {
    currentPassword: string;
    newPassword: string;
  },
) {
  return request<{ message: string }>(
    '/auth/me/password',
    {
      method: 'POST',
      body: jsonBody(input),
    },
    token,
  );
}

export async function uploadMyAvatar(token: string, avatarFile: File) {
  const formData = new FormData();
  formData.append('avatar', avatarFile, avatarFile.name);

  return request<User>(
    '/auth/me/avatar',
    {
      method: 'POST',
      body: formData,
    },
    token,
  );
}

export async function removeMyAvatar(token: string) {
  return request<User>(
    '/auth/me/avatar',
    {
      method: 'DELETE',
    },
    token,
  );
}
