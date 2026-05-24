import { useMemo, useState } from 'react';
import { useBroadcast } from '../services/broadcast-context';

export function BroadcastNavBadge() {
  const {
    isEnabled,
    publicWatchUrl,
    viewerCount,
    copyPublicWatchUrl,
  } = useBroadcast();
  const [copied, setCopied] = useState(false);

  const viewerLabel = useMemo(() => {
    if (viewerCount === 1) {
      return '1 viewer';
    }

    return `${viewerCount} viewers`;
  }, [viewerCount]);

  const badgeLabel = `Broadcasting - ${viewerLabel} - click to copy stream link`;

  if (!isEnabled || !publicWatchUrl) {
    return null;
  }

  async function handleCopy() {
    const copiedSuccessfully = await copyPublicWatchUrl();
    setCopied(copiedSuccessfully);

    if (copiedSuccessfully) {
      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    }
  }

  return (
    <button
      type="button"
      className={`top-nav-broadcast-indicator ${copied ? 'copied' : ''}`}
      onClick={() => {
        void handleCopy();
      }}
      title={publicWatchUrl}
    >
      <span className="top-nav-broadcast-indicator-text">{badgeLabel}</span>
      <span
        className={`top-nav-broadcast-indicator-status ${copied ? 'is-visible' : ''}`}
        aria-hidden={!copied}
      >
        Copied
      </span>
    </button>
  );
}
