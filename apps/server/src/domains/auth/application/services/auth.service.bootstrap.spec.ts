import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AccountsStore } from '../../infrastructure/stores/accounts.store';
import { InviteTokensStore } from '../../infrastructure/stores/invite-tokens.store';
import { AuthAdminAccountService } from './auth-admin-account.service';
import { AuthAvatarService } from './auth-avatar.service';
import { AuthService } from './auth.service';
import { AuthTvPairingService } from './auth-tv-pairing.service';

describe('AuthService administrator bootstrap', () => {
  it('never seeds or resets an administrator when any account already exists', async () => {
    const findByEmail = jest.fn();
    const create = jest.fn();
    const accountsStore = {
      list: jest.fn().mockResolvedValue([{ id: 'existing-account' }]),
      findByEmail,
      create,
    } as unknown as AccountsStore;
    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          DEFAULT_ADMIN_EMAIL: 'replacement@example.com',
          DEFAULT_ADMIN_NAME: 'Replacement Admin',
          DEFAULT_ADMIN_PASSWORD: 'DoNotUseThisPassword',
        };
        return values[key];
      }),
    } as unknown as ConfigService;
    const service = new AuthService(
      accountsStore,
      {} as InviteTokensStore,
      configService,
      {} as JwtService,
      {} as AuthAdminAccountService,
      {} as AuthTvPairingService,
      {} as AuthAvatarService,
    );

    await service.onModuleInit();

    expect(findByEmail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
});
