import type { TorrentControlActionIconName } from './torrentControlUtils';

export function TorrentControlActionIcon({
  name,
}: {
  name: TorrentControlActionIconName;
}) {
  switch (name) {
    case 'selectVisible':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M7 12l3.2 3.2L17 8.5" />
        </svg>
      );
    case 'clear':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M9 9l6 6M15 9l-6 6" />
        </svg>
      );
    case 'start':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 5.5v13l10-6.5-10-6.5z" className="torrent-control-action-icon-fill" />
        </svg>
      );
    case 'stop':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="7" y="7" width="10" height="10" rx="1.5" className="torrent-control-action-icon-fill" />
        </svg>
      );
    case 'restart':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          <path d="M20 5v6h-6" />
        </svg>
      );
    case 'sequential':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h9M4 12h9M4 18h9" />
          <path d="M17 7v10m0 0-3-3m3 3 3-3" />
        </svg>
      );
    case 'random':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h4l10 10h2" />
          <path d="M18 5l3 2-3 2" />
          <path d="M4 17h4l2-2" />
          <path d="M18 15l3 2-3 2" />
        </svg>
      );
    case 'delete':
      return (
        <svg className="torrent-control-action-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 7h14" />
          <path d="M9 7V5h6v2" />
          <path d="M8 7l1 12h6l1-12" />
          <path d="M10.5 10.5v6M13.5 10.5v6" />
        </svg>
      );
    default:
      return null;
  }
}
