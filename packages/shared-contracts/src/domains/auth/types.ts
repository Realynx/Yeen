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
