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
  let attemptedNetworkRecovery = false;
  let restartingSession = false;

  hls.on(Hls.Events.ERROR, (_event, data: ErrorData) => {
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

    if (restartingSession) {
      return;
    }

    restartingSession = true;
    setPlayerError(
      'Network instability persisted. Restarting stream session...',
    );

    void restartHlsSession()
      .then((restarted) => {
        if (restarted) {
          return;
        }
        setPlayerError(
          'Network instability persisted and stream recovery failed. Reload and try again.',
        );
        hls.destroy();
        clearHlsRef();
      })
      .finally(() => {
        restartingSession = false;
      });
  }
}
