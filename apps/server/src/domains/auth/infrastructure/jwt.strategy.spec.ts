import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  function createStrategy() {
    const configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;

    const accountsStore = {
      findById: jest.fn(),
    } as unknown as import('./stores/accounts.store').AccountsStore;

    const strategy = new JwtStrategy(configService, accountsStore);

    return {
      strategy,
      accountsStore,
    };
  }

  it('hydrates auth user from the current account record', async () => {
    const { strategy, accountsStore } = createStrategy();

    (accountsStore.findById as jest.Mock).mockResolvedValue({
      id: 'account-1',
      email: 'fresh@example.com',
      name: 'Fresh Name',
      passwordHash: 'hash',
      avatarDataUrl: null,
      role: 'user',
      invitesRemaining: 1,
      maxBitrateKbps: null,
      invitedByAccountId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const validated = await strategy.validate({
      sub: 'account-1',
      email: 'stale@example.com',
      name: 'Stale Name',
      role: 'admin',
    });

    expect(validated).toEqual({
      sub: 'account-1',
      email: 'fresh@example.com',
      name: 'Fresh Name',
      role: 'user',
    });
  });

  it('rejects malformed JWT payloads before account lookup', async () => {
    const { strategy, accountsStore } = createStrategy();

    await expect(
      strategy.validate({
        sub: 'account-1',
        email: 'no-role@example.com',
        name: 'No Role',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(accountsStore.findById).not.toHaveBeenCalled();
  });

  it('rejects tokens for deleted or missing accounts', async () => {
    const { strategy, accountsStore } = createStrategy();
    (accountsStore.findById as jest.Mock).mockResolvedValue(undefined);

    await expect(
      strategy.validate({
        sub: 'account-404',
        email: 'missing@example.com',
        name: 'Missing',
        role: 'admin',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
