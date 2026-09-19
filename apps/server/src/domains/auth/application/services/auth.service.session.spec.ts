import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AccountRecord } from '../../domain/entities/account-record.entity';
import type { AuthUser } from '../../domain/entities/auth-user.entity';
import { AccountsStore } from '../../infrastructure/stores/accounts.store';
import { InviteTokensStore } from '../../infrastructure/stores/invite-tokens.store';
import { AuthAdminAccountService } from './auth-admin-account.service';
import { AuthAvatarService } from './auth-avatar.service';
import { AuthService } from './auth.service';
import { AuthTvPairingService } from './auth-tv-pairing.service';

describe('AuthService rolling sessions', () => {
  it('issues a fresh access token from the current account record', async () => {
    const account: AccountRecord = {
      id: 'account-1',
      email: 'updated@example.com',
      name: 'Updated Name',
      passwordHash: 'hash',
      avatarDataUrl: null,
      role: 'user',
      invitesRemaining: 0,
      maxBitrateKbps: null,
      invitedByAccountId: null,
      createdAt: '2026-08-24T00:00:00.000Z',
    };
    const accountsStore = {
      findById: jest.fn().mockResolvedValue(account),
    } as unknown as AccountsStore;
    const signAsync = jest.fn().mockResolvedValue('fresh-access-token');
    const service = new AuthService(
      accountsStore,
      {} as InviteTokensStore,
      {} as ConfigService,
      { signAsync } as unknown as JwtService,
      {} as AuthAdminAccountService,
      {} as AuthTvPairingService,
      {} as AuthAvatarService,
    );
    const staleIdentity: AuthUser = {
      sub: account.id,
      email: 'old@example.com',
      name: 'Old Name',
      role: 'admin',
    };

    await expect(service.refreshSession(staleIdentity)).resolves.toMatchObject({
      accessToken: 'fresh-access-token',
      user: {
        id: account.id,
        email: account.email,
        name: account.name,
        role: account.role,
      },
    });
    expect(signAsync).toHaveBeenCalledWith({
      sub: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
    });
  });
});
