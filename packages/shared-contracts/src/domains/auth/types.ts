export type UserRole = 'admin' | 'sailer' | 'user';

export interface AuthUser {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarDataUrl?: string | null;
  role: UserRole;
  invitesRemaining: number | null;
  maxBitrateKbps: number | null;
  invitedByAccountId: string | null;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface TvPairingStartRequest {
  clientId?: string;
  deviceName?: string;
  devicePlatform?: string;
}

export interface TvPairingStartResponse {
  pairingId: string;
  code: string;
  pollToken: string;
  expiresAt: string;
  pollIntervalSeconds: number;
  pollTimeoutSeconds: number;
}

export interface TvPairingClaimRequest {
  code: string;
}

export interface TvPairingClaimResponse {
  pairingId: string;
  code: string;
  status: 'claimed';
  claimedAt: string;
  expiresAt: string;
}

export type TvPairingStatus =
  | 'pending'
  | 'approved'
  | 'expired'
  | 'consumed'
  | 'denied';

export interface TvPairingPollRequest {
  pollToken: string;
}

export interface TvPairingPollResponse {
  pairingId: string;
  code: string;
  status: TvPairingStatus;
  expiresAt: string;
  pollIntervalSeconds: number;
  message?: string;
  auth?: AuthResponse;
}

export interface InviteStatus {
  token: string;
  inviterName: string;
  createdAt: string;
}

export interface CreatedInvite {
  token: string;
  invitePath: string;
  createdAt: string;
  remainingInvites: number | null;
}

export interface AdminManagedAccount extends User {
  invitedByName: string | null;
}
