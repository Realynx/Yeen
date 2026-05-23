import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { LibrarySearchForm } from '../../navigation/components/LibrarySearchForm';
import { ProfileMenu } from '../../navigation/components/ProfileMenu';
import {
  getTorrentStatus,
  isRemoteMediaId,
  listMedia,
  toApiErrorMessage,
  type TorrentStatusResponse,
} from '../../shared/services/api';
import type { User } from '../../shared/services/types';
import {
  pickRandomItem,
  toLibrarySearchPath,
  toRandomDetailsCandidates,
} from '../../library/services/librarySearchUtils';
import { formatBytes, formatEta, formatRate } from '../services/torrentPrepareFormatting';

const PREPARE_POLL_INTERVAL_MS = 3_000;

interface PlayerPreparingPanelProps {
  token: string;
  user: User;
  onLogout: () => void;
  mediaId: string;
  hash: string;
  fallbackTitle: string;
  hideTopNav?: boolean;
  headerContent?: ReactNode;
}

export function PlayerPreparingPanel({
  token,
  user,
  onLogout,
  mediaId,
  hash,
  fallbackTitle,
  hideTopNav = false,
  headerContent = null,
}: PlayerPreparingPanelProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<TorrentStatusResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    hash ? null : 'No torrent hash supplied.',
  );
  const [navigated, setNavigated] = useState(false);
  const inFlightRef = useRef(false);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate(toLibrarySearchPath(query));
  }

  async function openRandomDetails() {
    try {
      const mediaItems = await listMedia(token);
      const randomCandidate = pickRandomItem(toRandomDetailsCandidates(mediaItems));
      if (!randomCandidate) {
        return;
      }

      navigate(`/details/${randomCandidate.id}`);
    } catch {
      // Preserve current prepare status if random lookup fails.
    }
  }

  useEffect(() => {
    if (!hash) {
      return;
    }

    if (navigated) {
      return;
    }

    let cancelled = false;

    async function pollOnce() {
      if (cancelled || inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;
      try {
        const response = await getTorrentStatus(token, hash);
        if (cancelled) {
          return;
        }

        setStatus(response);
        setErrorMessage(null);

        if (response.indexResult.status === 'indexed') {
          setNavigated(true);
          navigate(`/player/${response.indexResult.media.id}`, { replace: true });
        }
      } catch (pollError) {
        if (!cancelled) {
          setErrorMessage(
            toApiErrorMessage(pollError, 'Failed to fetch torrent status.'),
          );
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    void pollOnce();
    const intervalId = window.setInterval(() => {
      void pollOnce();
    }, PREPARE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hash, navigate, navigated, token]);

  const torrent = status?.torrent ?? null;
  const indexResult = status?.indexResult ?? null;
  const displayTitle = useMemo(() => {
    return torrent?.name?.trim() || fallbackTitle || 'Preparing torrent...';
  }, [fallbackTitle, torrent?.name]);
  const progressPercent = Math.min(
    100,
    Math.max(0, (torrent?.progress ?? 0) * 100),
  );
  const pendingReason =
    indexResult?.status === 'pending' ? indexResult.reason : null;
  const isIndexed = indexResult?.status === 'indexed';
  const pageClassName = hideTopNav
    ? 'player-page prepare-stream-page phone-player-page'
    : 'player-page prepare-stream-page';

  function handleBack() {
    if (isRemoteMediaId(mediaId)) {
      navigate(`/details/${mediaId}`);
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate('/library');
  }

  return (
    <main className={pageClassName}>
      {headerContent}

      {!hideTopNav ? (
        <header className="top-nav">
          <div className="top-nav-left">
            <button
              type="button"
              className="nav-back-button"
              onClick={handleBack}
            >
              {isRemoteMediaId(mediaId) ? '< Back to details' : '< Back'}
            </button>
            <p className="brand-mark">YEEN</p>
            <p className="page-nav-title" title={displayTitle}>
              Preparing stream
            </p>
          </div>
          <div className="top-nav-right">
            <LibrarySearchForm
              query={query}
              onQueryChange={setQuery}
              onSearchSubmit={handleSearch}
              placeholder="Search titles and paths"
              onOpenRandomDetails={openRandomDetails}
            />
            <ProfileMenu user={user} onLogout={onLogout} />
          </div>
        </header>
      ) : null}

      <section className="prepare-stream-panel">
        <p className="eyebrow">Stream queued</p>
        <h1 className="prepare-stream-title">{displayTitle}</h1>

        <div className="prepare-stream-progress">
          <div className="prepare-stream-progress-bar" aria-hidden="true">
            <div
              className="prepare-stream-progress-bar-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="prepare-stream-progress-text">
            {progressPercent.toFixed(1)}% downloaded
            {torrent ? (
              <>
                {' · '}
                {formatBytes(torrent.completedBytes)} of {formatBytes(torrent.sizeBytes)}
              </>
            ) : null}
          </p>
        </div>

        {torrent ? (
          <dl className="prepare-stream-stats">
            <div>
              <dt>State</dt>
              <dd>{torrent.state || 'unknown'}</dd>
            </div>
            <div>
              <dt>Download rate</dt>
              <dd>{formatRate(torrent.downloadRate)}</dd>
            </div>
            <div>
              <dt>ETA</dt>
              <dd>{formatEta(torrent.etaSeconds)}</dd>
            </div>
            <div>
              <dt>Upload rate</dt>
              <dd>{formatRate(torrent.uploadRate)}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted">
            qBittorrent has not reported this torrent yet. It may still be
            starting up.
          </p>
        )}

        <div className="prepare-stream-status">
          {isIndexed ? (
            <p className="success-text">Indexed. Opening player...</p>
          ) : pendingReason ? (
            <p className="muted">{pendingReason}</p>
          ) : (
            <p className="muted">
              Waiting for enough of the file to download to start streaming...
            </p>
          )}
          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
        </div>
      </section>
    </main>
  );
}
