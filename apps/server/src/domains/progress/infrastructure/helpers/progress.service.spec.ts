import type { AuthUser } from '../../../auth/domain/entities/auth-user.entity';
import type { ProgressEntry } from '../../domain/entities/progress-entry.entity';
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
      listForAccount: jest.fn((accountId: string) => {
        if (!stored || stored.accountId !== accountId) {
          return Promise.resolve([]);
        }

        return Promise.resolve([stored]);
      }),
      get: jest.fn((accountId: string, mediaId: string) => {
        if (!stored) {
          return Promise.resolve(undefined);
        }

        if (stored.accountId !== accountId || stored.mediaId !== mediaId) {
          return Promise.resolve(undefined);
        }

        return Promise.resolve(stored);
      }),
      upsert: jest.fn((next: ProgressEntry) => {
        stored = next;
        return Promise.resolve(next);
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

  it('does not auto-complete short media near the start', async () => {
    const progress = await service.upsert(user, 'media-short-1', {
      positionSeconds: 5,
      durationSeconds: 120,
      syncTimestampMs: 5000,
    });

    expect(progress.completed).toBe(false);
    expect(progress.positionSeconds).toBe(5);
    expect(stored?.completed).toBe(false);
    expect(stored?.positionSeconds).toBe(5);
  });

  it('auto-completes short media when close to the end', async () => {
    const progress = await service.upsert(user, 'media-short-2', {
      positionSeconds: 111,
      durationSeconds: 120,
      syncTimestampMs: 6000,
    });

    expect(progress.completed).toBe(true);
    expect(progress.positionSeconds).toBe(120);
    expect(stored?.completed).toBe(true);
    expect(stored?.positionSeconds).toBe(120);
  });
});
