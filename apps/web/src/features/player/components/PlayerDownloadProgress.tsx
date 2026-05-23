import type { TorrentItem } from '../../shared/services/types';
import { clamp } from '../services/playerUtils';
import { formatBytes, formatEta, formatRate } from '../services/torrentPrepareFormatting';

interface PlayerDownloadProgressProps {
  torrent: TorrentItem | null;
}

export function PlayerDownloadProgress({ torrent }: PlayerDownloadProgressProps) {
  if (!torrent) {
    return null;
  }

  const progressPercent = clamp(torrent.progress * 100, 0, 100);

  return (
    <section className="player-download-progress" aria-live="polite">
      <div className="player-download-progress-header">
        <p className="eyebrow">Torrent Download</p>
        <p className="player-download-progress-percent">{progressPercent.toFixed(1)}%</p>
      </div>

      <div className="player-download-progress-bar" aria-hidden="true">
        <div
          className="player-download-progress-bar-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="player-download-progress-meta">
        <span>
          {formatBytes(torrent.completedBytes)} of {formatBytes(torrent.sizeBytes)}
        </span>
        <span>{formatRate(torrent.downloadRate)}</span>
        <span>ETA {formatEta(torrent.etaSeconds)}</span>
      </div>
    </section>
  );
}
