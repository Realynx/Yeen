import { useMemo, useState } from 'react';
import { TvPageShell } from '../../navigation/components/TvPageShell';
import { useClientExperience } from '../../navigation/services/clientExperience';
import type { BroadcastStatusSnapshot } from '../services/publicBroadcastPlaybackSync';
import { usePublicBroadcastPlaybackController } from './usePublicBroadcastPlaybackController';
import { usePublicBroadcastPlaybackRecovery } from './usePublicBroadcastPlaybackRecovery';
import { usePublicBroadcastSessionPolling } from './usePublicBroadcastSessionPolling';
import { usePublicBroadcastStartPlayback } from './usePublicBroadcastStartPlayback';
import { usePublicBroadcastSubtitles } from './usePublicBroadcastSubtitles';
import './public-broadcast-page.css';

interface PublicBroadcastPageProps {
  shareToken?: string;
}

export function PublicBroadcastPage({ shareToken }: PublicBroadcastPageProps) {
  const experience = useClientExperience();
  const isTvExperience = experience === 'tv';
  const resolvedShareToken = shareToken?.trim() || '';

  const [statusSnapshot, setStatusSnapshot] = useState<BroadcastStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(Boolean(resolvedShareToken));
  const [error, setError] = useState<string | null>(null);

  const status = statusSnapshot?.status ?? null;
  const isStandbyState = Boolean(status?.enabled && !status.isLive);
  const isLiveState = Boolean(
    status?.enabled
    && status.isLive
    && status.manifestUrl,
  );

  const {
    videoRef,
    hlsRef,
    manifestUrlRef,
    statusRef,
    syncStateRef,
    runPlaybackSyncRef,
    suppressSeekGuardUntilRef,
    lastStallRecoveryAtRef,
    playbackWatchdogRef,
    resetPlaybackWatchdog,
    destroyHlsInstance,
    handleVideoSeeking,
  } = usePublicBroadcastPlaybackController({
    statusSnapshot,
    setError,
  });

  usePublicBroadcastSessionPolling({
    resolvedShareToken,
    setStatusSnapshot,
    setLoading,
    setError,
    statusRef,
    runPlaybackSyncRef,
  });

  usePublicBroadcastPlaybackRecovery({
    status,
    videoRef,
    hlsRef,
    manifestUrlRef,
    statusRef,
    syncStateRef,
    runPlaybackSyncRef,
    suppressSeekGuardUntilRef,
    lastStallRecoveryAtRef,
    playbackWatchdogRef,
    setError,
    resetPlaybackWatchdog,
    destroyHlsInstance,
  });

  const {
    activeSubtitleUrl,
    subtitleVideoStyle,
    handleSubtitleTrackError,
  } = usePublicBroadcastSubtitles({
    resolvedShareToken,
    status,
    isLiveState,
    videoRef,
  });

  const {
    showStartPlaybackButton,
    startPlaybackButtonRef,
    handleStartPlaybackClick,
  } = usePublicBroadcastStartPlayback({
    videoRef,
    hlsRef,
    runPlaybackSyncRef,
    isLiveState,
    playbackIsPlaying: Boolean(status?.playbackIsPlaying),
    isTvExperience,
    setError,
  });

  const viewerLabel = useMemo(() => {
    const viewerCount = status?.viewerCount ?? 0;
    if (viewerCount === 1) {
      return '1 viewer';
    }

    return `${viewerCount} viewers`;
  }, [status?.viewerCount]);

  const page = !resolvedShareToken ? (
    <main className="broadcast-public-page">
      <section className="broadcast-public-shell">
        <p className="error-text">Broadcast token is missing.</p>
      </section>
    </main>
  ) : (
    <main className="broadcast-public-page">
      <section className="broadcast-public-shell">
        <header className="broadcast-public-header">
          <p className="eyebrow">YEEN Broadcast</p>
          <h1>Anonymous Stream</h1>
          <p className="broadcast-public-viewers">{viewerLabel}</p>
        </header>

        {loading ? (
          <p className="muted">Loading broadcast...</p>
        ) : null}

        {error ? (
          <p className="error-text broadcast-public-error">{error}</p>
        ) : null}

        {!loading && !status?.enabled ? (
          <section className="broadcast-offline-card" aria-live="polite">
            <h2>Broadcast is offline</h2>
            <p>The broadcaster has not enabled broadcast mode yet.</p>
          </section>
        ) : null}

        {isStandbyState ? (
          <section className="broadcast-standby" aria-live="polite">
            <div className="broadcast-standby-bars" aria-hidden="true" />
            <div className="broadcast-standby-loader">
              <span className="broadcast-standby-spinner" aria-hidden="true" />
              <p>Waiting for the broadcaster to start playback...</p>
            </div>
          </section>
        ) : null}

        {isLiveState ? (
          <section
            className="broadcast-live-player"
            aria-live="polite"
            data-tv-focus-zone="hero"
            data-tv-focus-lane-id="broadcast-player"
          >
            <video
              ref={videoRef}
              className="broadcast-public-video"
              style={subtitleVideoStyle}
              autoPlay
              playsInline
              preload="auto"
              crossOrigin="anonymous"
              controls
              controlsList="nodownload noplaybackrate"
              tabIndex={-1}
              onSeeking={handleVideoSeeking}
            >
              {activeSubtitleUrl ? (
                <track
                  key={activeSubtitleUrl}
                  kind="subtitles"
                  src={activeSubtitleUrl}
                  srcLang="en"
                  label="Subtitles"
                  default
                  onError={handleSubtitleTrackError}
                />
              ) : null}
            </video>

            {showStartPlaybackButton ? (
              <button
                ref={startPlaybackButtonRef}
                type="button"
                className="broadcast-start-playback-button"
                onClick={handleStartPlaybackClick}
                aria-label="Start stream playback"
              >
                <span className="broadcast-start-playback-icon" aria-hidden="true" />
              </button>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );

  if (isTvExperience) {
    return (
      <TvPageShell pageKey="broadcast" autoFocusFirst={false}>
        {page}
      </TvPageShell>
    );
  }

  return page;
}