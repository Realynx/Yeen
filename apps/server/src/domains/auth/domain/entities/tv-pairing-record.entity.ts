export interface TvPairingRecord {
  id: string;
  code: string;
  pollToken: string;
  clientId: string | null;
  deviceName: string | null;
  devicePlatform: string | null;
  createdAt: string;
  expiresAt: string;
  claimedAt: string | null;
  claimedByAccountId: string | null;
  consumedAt: string | null;
}
