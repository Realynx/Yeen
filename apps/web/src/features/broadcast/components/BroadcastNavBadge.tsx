import { useMemo, useState } from 'react';
import { useBroadcast } from '../services/broadcast-context';

export function BroadcastNavBadge() {
  const {
    isEnabled,
    publicWatchUrl,
    directStreamUrl,
    viewerCount,
    copyPublicWatchUrl,
    copyDirectStreamUrl,
  } = useBroadcast();
  const [copiedPublic, setCopiedPublic] = useState(false);
  const [copiedDirect, setCopiedDirect] = useState(false);

  const viewerLabel = useMemo(() => {
    if (viewerCount === 1) {
      return '1 viewer';
    }

    return `${viewerCount} viewers`;
  }, [viewerCount]);

  const badgeLabel = `Broadcasting - ${viewerLabel}`;

  if (!isEnabled || !publicWatchUrl || !directStreamUrl) {
    return null;
  }

  function scheduleCopiedReset(setCopied: (value: boolean) => void) {
    window.setTimeout(() => {
      setCopied(false);
    }, 1800);
  }

  async function handleCopyPublicWatch() {
    const copiedSuccessfully = await copyPublicWatchUrl();
    setCopiedPublic(copiedSuccessfully);

    if (copiedSuccessfully) {
      scheduleCopiedReset(setCopiedPublic);
    }
  }

  async function handleCopyDirectStream() {
    const copiedSuccessfully = await copyDirectStreamUrl();
    setCopiedDirect(copiedSuccessfully);

    if (copiedSuccessfully) {
      scheduleCopiedReset(setCopiedDirect);
    }
  }

  return (
    <div className="top-nav-broadcast-indicator-group">
      <button
        type="button"
        className={`top-nav-broadcast-indicator ${copiedPublic ? 'copied' : ''}`}
        onClick={() => {
          void handleCopyPublicWatch();
        }}
        title={publicWatchUrl}
      >
        <span className="top-nav-broadcast-indicator-text">{badgeLabel}</span>
        <span
          className={`top-nav-broadcast-indicator-status ${copiedPublic ? 'is-visible' : ''}`}
          aria-hidden={!copiedPublic}
        >
          Copied
        </span>
      </button>

      <button
        type="button"
        className={`top-nav-broadcast-direct-link ${copiedDirect ? 'copied' : ''}`}
        onClick={() => {
          void handleCopyDirectStream();
        }}
        title={directStreamUrl}
      >
        <span className="top-nav-broadcast-direct-link-text">Copy VLC URL</span>
        <span
          className={`top-nav-broadcast-direct-link-status ${copiedDirect ? 'is-visible' : ''}`}
          aria-hidden={!copiedDirect}
        >
          Copied
        </span>
      </button>
    </div>
  );
}
