import { AccountRecord } from '../../domain/entities/account-record.entity';

export function toSafeAccount(account: AccountRecord) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    avatarDataUrl: account.avatarDataUrl ?? null,
    role: account.role,
    invitesRemaining:
      account.role === 'admin' ? null : (account.invitesRemaining ?? 0),
    maxBitrateKbps: account.maxBitrateKbps ?? null,
    invitedByAccountId: account.invitedByAccountId ?? null,
    createdAt: account.createdAt,
  };
}
