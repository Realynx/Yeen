import { describe, expect, it, vi } from 'vitest';
import type { ProgressEntry } from '../../shared/services/types';
import {
  createMusicVolumePreference,
  mergeMusicProgressEntry,
  MusicProgressEntryCache,
  musicPlaybackToggleAction,
  musicVolumeStorageKey,
  nextMusicProgressTimestamp,
  readMusicVolume,
  resolveMusicVolumePreference,
  resolveMusicResumePosition,
  writeMusicVolume,
} from './musicPlaybackState';

function progress(overrides: Partial<ProgressEntry> = {}): ProgressEntry {
  return {
    accountId: 'account-1',
    mediaId: 'track-1',
    positionSeconds: 42,
    durationSeconds: 180,
    syncTimestampMs: 1_000,
    completed: false,
    updatedAt: '2026-08-23T12:00:00.000Z',
    ...overrides,
  };
}

describe('music playback state', () => {
  it('starts the first track when Play is pressed without a selection', () => {
    expect(musicPlaybackToggleAction({
      hasCurrentTrack: false,
      audioPaused: true,
      trackCount: 3,
    })).toBe('start-first');
    expect(musicPlaybackToggleAction({
      hasCurrentTrack: false,
      audioPaused: true,
      trackCount: 0,
    })).toBe('none');
  });

  it('otherwise toggles the mounted audio element', () => {
    expect(musicPlaybackToggleAction({
      hasCurrentTrack: true,
      audioPaused: true,
      trackCount: 3,
    })).toBe('play');
    expect(musicPlaybackToggleAction({
      hasCurrentTrack: true,
      audioPaused: false,
      trackCount: 3,
    })).toBe('pause');
  });

  it('persists a normalized volume independently for each account', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };

    writeMusicVolume('account-1', 1.5, storage);
    writeMusicVolume('account-2', 0.35, storage);

    expect(values.get(musicVolumeStorageKey('account-1'))).toBe('1');
    expect(readMusicVolume('account-1', storage)).toBe(1);
    expect(readMusicVolume('account-2', storage)).toBe(0.35);
  });

  it('derives volume from the current account instead of retaining the first account', () => {
    const values = new Map([
      [musicVolumeStorageKey('account-1'), '0.25'],
      [musicVolumeStorageKey('account-2'), '0.75'],
    ]);
    const storage = { getItem: (key: string) => values.get(key) ?? null };
    const firstAccount = createMusicVolumePreference('account-1', storage);

    expect(resolveMusicVolumePreference('account-1', firstAccount, storage)).toBe(0.25);
    expect(resolveMusicVolumePreference('account-2', firstAccount, storage)).toBe(0.75);
  });

  it('falls back safely when a stored volume is missing or invalid', () => {
    expect(readMusicVolume('account-1', { getItem: () => null })).toBe(0.8);
    expect(readMusicVolume('account-1', { getItem: () => 'loud' })).toBe(0.8);
    expect(readMusicVolume('account-1', { getItem: () => '3' })).toBe(0.8);
  });

  it('ignores unavailable browser storage', () => {
    expect(readMusicVolume('account-1', {
      getItem: () => { throw new Error('blocked'); },
    })).toBe(0.8);

    expect(() => writeMusicVolume('account-1', 0.5, {
      setItem: vi.fn(() => { throw new Error('full'); }),
    })).not.toThrow();
  });

  it('produces strictly monotonic progress timestamps', () => {
    expect(nextMusicProgressTimestamp(5_000, 4_000)).toBe(5_001);
    expect(nextMusicProgressTimestamp(5_000, 8_000)).toBe(8_000);
  });

  it('restores only unfinished progress and clamps it to the known duration', () => {
    expect(resolveMusicResumePosition(progress())).toBe(42);
    expect(resolveMusicResumePosition(progress({ positionSeconds: 300 }))).toBe(180);
    expect(resolveMusicResumePosition(progress({ completed: true }))).toBe(0);
    expect(resolveMusicResumePosition(progress({ positionSeconds: 0 }))).toBe(0);
  });

  it('does not let a late progress response replace a fresher snapshot', () => {
    const current = progress({ positionSeconds: 80, syncTimestampMs: 2_000 });
    const stale = progress({ positionSeconds: 40, syncTimestampMs: 1_000 });
    const fresh = progress({ positionSeconds: 90, syncTimestampMs: 3_000 });

    expect(mergeMusicProgressEntry(current, stale)).toEqual(current);
    expect(mergeMusicProgressEntry(current, fresh)).toEqual(fresh);
  });

  it('ignores progress from a request belonging to an older account identity', () => {
    const cache = new MusicProgressEntryCache();
    cache.resetForIdentity('account-1\u0000token-1');
    cache.resetForIdentity('account-2\u0000token-2');

    expect(cache.mergeForIdentity(
      'account-1\u0000token-1',
      progress({ accountId: 'account-1' }),
    )).toBe(false);
    expect(cache.getForIdentity('account-2\u0000token-2', 'track-1')).toBeUndefined();

    const currentAccountProgress = progress({
      accountId: 'account-2',
      userId: 'account-2',
      positionSeconds: 55,
    });
    expect(cache.mergeForIdentity(
      'account-2\u0000token-2',
      currentAccountProgress,
    )).toBe(true);
    expect(cache.getForIdentity('account-2\u0000token-2', 'track-1'))
      .toEqual(currentAccountProgress);
  });
});
