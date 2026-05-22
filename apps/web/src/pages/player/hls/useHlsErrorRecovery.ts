import Hls, { type ErrorData } from 'hls.js';

export interface HlsErrorRecoveryDeps {
  hls: Hls;
  restartHlsSession: () => Promise<boolean>;
  setPlayerError: (value: string | null) => void;
  clearHlsRef: () => void;
}

/**
 * Encapsulates the fatal-error recovery state machine for an Hls instance.
 *
 * Network errors escalate from "nudge the loader" → "restart the session" →
 * "give up". Media errors get one in-place recovery attempt. Each instance is
 * single-use; create a fresh one per Hls instance.
 *
 * Pulled out of `usePlayerMediaSource` so the setup effect doesn't carry the
 * recovery state in its closure, and so the state transitions are testable
 * without spinning up an Hls instance.
 */
export function attachHlsErrorRecovery({
  hls,
  restartHlsSession,
  setPlayerError,
  clearHlsRef,
}: HlsErrorRecoveryDeps): void {
  const START_SEGMENT_503_WINDOW_MS = 30000;
  const MAX_START_SEGMENT_503S_PER_WINDOW = 6;

  let attemptedNetworkRecovery = false;
  let restartingSession = false;
  let startSegment503WindowStartedAtMs = 0;
  let startSegment503Count = 0;

  hls.on(Hls.Events.ERROR, (_event, data: ErrorData) => {
    if (isSourceUnreachableError(data)) {
      setPlayerError(
        'Media source is unreachable. Check that the storage share is online and try again.',
      );
      hls.destroy();
      clearHlsRef();
      return;
    }

    if (shouldRestartForPersistentStartSegment503(data)) {
      restartSession(
        'Startup segment is still unavailable. Restarting stream session...',
      );
      return;
    }

    if (!data.fatal) {
      return;
    }

    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
      handleNetworkError();
      return;
    }

    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
      hls.recoverMediaError();
      setPlayerError('Media decoding issue detected. Attempting to recover...');
      return;
    }

    setPlayerError('HLS playback failed. Refresh and try again.');
    hls.destroy();
    clearHlsRef();
  });

  function shouldRestartForPersistentStartSegment503(data: ErrorData): boolean {
    if (data.fatal) {
      return false;
    }

    const status = getResponseStatus(data);
    if (status !== 503) {
      return false;
    }

    if (!isStartSegment(data)) {
      return false;
    }

    const now = Date.now();
    if (now - startSegment503WindowStartedAtMs > START_SEGMENT_503_WINDOW_MS) {
      startSegment503WindowStartedAtMs = now;
      startSegment503Count = 0;
    }

    startSegment503Count += 1;
    return startSegment503Count >= MAX_START_SEGMENT_503S_PER_WINDOW;
  }

  function isSourceUnreachableError(data: ErrorData): boolean {
    // The server returns HTTP 502 from the segment/manifest endpoints when the
    // underlying media storage (typically an SMB share) does not respond to a
    // basic existence probe. That state is not something hls.js can recover
    // from by retrying or restarting the session, so escalate immediately
    // instead of looping the 503-restart state machine.
    return getResponseStatus(data) === 502;
  }

  function getResponseStatus(data: ErrorData): number | null {
    const response = (data as unknown as {
      response?: { code?: number; status?: number };
    }).response;
    if (!response || typeof response !== 'object') {
      return null;
    }

    const status =
      typeof response.code === 'number'
        ? response.code
        : typeof response.status === 'number'
          ? response.status
          : null;

    return status;
  }

  function isStartSegment(data: ErrorData): boolean {
    const frag = (data as unknown as {
      frag?: { sn?: number | string };
    }).frag;
    if (frag && typeof frag === 'object') {
      if (typeof frag.sn === 'number') {
        return frag.sn === 0;
      }
      if (typeof frag.sn === 'string') {
        const parsed = Number.parseInt(frag.sn, 10);
        if (Number.isFinite(parsed)) {
          return parsed === 0;
        }
      }
    }

    const response = (data as unknown as {
      response?: { url?: string };
    }).response;
    const url = response?.url;
    return typeof url === 'string' && url.includes('segment_00000.ts');
  }

  function handleNetworkError() {
    // hls.js's built-in retry config covers transient hiccups. First step is to
    // nudge the loader; only escalate to a full session restart on the next
    // fatal network error.
    if (!attemptedNetworkRecovery) {
      attemptedNetworkRecovery = true;
      setPlayerError(
        'Network instability detected. Attempting to recover stream...',
      );
      try {
        hls.startLoad();
      } catch {
        // ignore — fall through to session restart on next error
      }
      return;
    }

    restartSession('Network instability persisted. Restarting stream session...');
  }

  function restartSession(message: string) {
    if (restartingSession) {
      return;
    }

    restartingSession = true;
    setPlayerError(message);

    void restartHlsSession()
      .then((restarted) => {
        if (restarted) {
          startSegment503WindowStartedAtMs = 0;
          startSegment503Count = 0;
          return;
        }
        setPlayerError(
          'Stream recovery failed after repeated retries. Reload and try again.',
        );
        hls.destroy();
        clearHlsRef();
      })
      .finally(() => {
        restartingSession = false;
      });
  }
}
