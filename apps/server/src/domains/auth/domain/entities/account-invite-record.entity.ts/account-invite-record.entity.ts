export interface AccountInviteRecord {
  id: string;
  token: string;
  inviterAccountId: string;
  createdAt: string;
  usedAt: string | null;
  usedByAccountId: string | null;
}
