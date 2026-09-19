import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { listProgress, upsertProgress } from '../../shared/services/api';
import { subscribeToProgressUpdates } from '../../shared/services/progressUpdates';
import type { ProgressEntry } from '../../shared/services/types';
import {
  MusicProgressEntryCache,
  nextMusicProgressTimestamp,
  resolveMusicResumePosition,
} from './musicPlaybackState';

const MUSIC_PROGRESS_SYNC_INTERVAL_MS = 5_000;

interface UseMusicProgressOptions {
  token: string;
  accountId: string;
  audioRef: RefObject<HTMLAudioElement | null>;
  currentTrackId: string | null;
  fallbackDuration: number;
  isPlaying: boolean;
}

export function useMusicProgress({
  token,
  accountId,
  audioRef,
  currentTrackId,
  fallbackDuration,
  isPlaying,
}: UseMusicProgressOptions) {
  const identity = `${accountId}\u0000${token}`;
  const entriesRef = useRef(new MusicProgressEntryCache());
  const loadRef = useRef<{ identity: string; promise: Promise<void> } | null>(null);
  const lastSyncTimestampRef = useRef(0);

  const mergeEntry = useCallback((entry: ProgressEntry) => {
    entriesRef.current.mergeForIdentity(identity, entry);
  }, [identity]);

  const ensureProgressLoaded = useCallback((): Promise<void> => {
    if (loadRef.current?.identity === identity) {
      return loadRef.current.promise;
    }

    entriesRef.current.resetForIdentity(identity);
    lastSyncTimestampRef.current = 0;
    const promise = listProgress(token)
      .then((entries) => {
        for (const entry of entries) {
          mergeEntry(entry);
        }
      })
      .catch(() => {
        // Progress lookup must not block music playback.
      });
    loadRef.current = { identity, promise };
    return promise;
  }, [identity, mergeEntry, token]);

  const prepareTrackPlayback = useCallback(async (trackId: string) => {
    await ensureProgressLoaded();
    return resolveMusicResumePosition(
      entriesRef.current.getForIdentity(identity, trackId),
    );
  }, [ensureProgressLoaded, identity]);

  const syncProgress = useCallback(async (
    completed = false,
    keepalive = false,
  ) => {
    const audio = audioRef.current;
    if (!audio || !currentTrackId) {
      return;
    }

    const positionSeconds = Math.max(0, Math.floor(audio.currentTime || 0));
    const audioDuration = Number.isFinite(audio.duration) ? audio.duration : fallbackDuration;
    const durationSeconds = Math.max(0, Math.floor(audioDuration || 0));
    if (!completed && positionSeconds <= 0) {
      return;
    }

    const syncTimestampMs = nextMusicProgressTimestamp(
      lastSyncTimestampRef.current,
      Date.now(),
    );
    lastSyncTimestampRef.current = syncTimestampMs;
    mergeEntry({
      accountId,
      userId: accountId,
      mediaId: currentTrackId,
      positionSeconds,
      durationSeconds,
      syncTimestampMs,
      completed,
      updatedAt: new Date(syncTimestampMs).toISOString(),
    });

    try {
      mergeEntry(await upsertProgress(
        token,
        currentTrackId,
        {
          positionSeconds,
          durationSeconds,
          syncTimestampMs,
          completed,
        },
        { keepalive },
      ));
    } catch {
      // Keep music playback uninterrupted if persistence fails.
    }
  }, [accountId, audioRef, currentTrackId, fallbackDuration, mergeEntry, token]);

  const syncProgressRef = useRef(syncProgress);

  useEffect(() => {
    syncProgressRef.current = syncProgress;
  }, [syncProgress]);

  useEffect(() => {
    void ensureProgressLoaded();
  }, [ensureProgressLoaded]);

  useEffect(() => subscribeToProgressUpdates(accountId, mergeEntry), [accountId, mergeEntry]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void syncProgress(false);
    }, MUSIC_PROGRESS_SYNC_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [isPlaying, syncProgress]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void syncProgressRef.current(false, true);
      }
    };
    const handlePageHide = () => {
      void syncProgressRef.current(false, true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      void syncProgressRef.current(false, true);
    };
  }, []);

  return { prepareTrackPlayback, syncProgress };
}
