import type { AuthUser } from '../../../auth/domain/entities/auth-user.entity.ts/auth-user.entity';
import type { ProgressEntry } from '../../domain/entities/progress-entry.entity.ts/progress-entry.entity';
import { ProgressService } from '../../application/services/progress.service';
import type { ProgressStore } from '../stores/progress.store';

describe('ProgressService', () => {
  const user = { sub: 'account-1' } as AuthUser;

  let stored: ProgressEntry | undefined;
  let progressStore: ProgressStore;
  let service: ProgressService;

  beforeEach(() => {
    stored = undefined;

    progressStore = {
      listForAccount: jest.fn(async (accountId: string) => {
        if (!stored || stored.accountId !== accountId) {
          return [];
        }

        return [stored];
      }),
      get: jest.fn(async (accountId: string, mediaId: string) => {
        if (!stored) {
          return undefined;
        }

        if (stored.accountId !== accountId || stored.mediaId !== mediaId) {
          return undefined;
        }

        return stored;
      }),
      upsert: jest.fn(async (next: ProgressEntry) => {
        stored = next;
        return next;
      }),
    } as unknown as ProgressStore;

    service = new ProgressService(progressStore);
  });

  it('ignores stale sync timestamps that arrive late', async () => {
    await service.upsert(user, 'media-1', {
      positionSeconds: 120,
      durationSeconds: 3600,
      syncTimestampMs: 2000,
    });

    const stale = await service.upsert(user, 'media-1', {
      positionSeconds: 30,
      durationSeconds: 3600,
      syncTimestampMs: 1000,
    });

    expect(stale.positionSeconds).toBe(120);
    expect(stored?.positionSeconds).toBe(120);
    expect(stored?.syncTimestampMs).toBe(2000);
  });

  it('accepts newer sync timestamps when playback rewinds', async () => {
    await service.upsert(user, 'media-1', {
      positionSeconds: 240,
      durationSeconds: 3600,
      syncTimestampMs: 3000,
    });

    const rewound = await service.upsert(user, 'media-1', {
      positionSeconds: 40,
      durationSeconds: 3600,
      syncTimestampMs: 4000,
    });

    expect(rewound.positionSeconds).toBe(40);
    expect(stored?.positionSeconds).toBe(40);
    expect(stored?.syncTimestampMs).toBe(4000);
  });
});
