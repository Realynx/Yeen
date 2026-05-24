export interface AccountRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  avatarDataUrl: string | null;
  role: 'admin' | 'sailer' | 'user';
  invitesRemaining: number | null;
  maxBitrateKbps: number | null;
  invitedByAccountId: string | null;
  createdAt: string;
}
