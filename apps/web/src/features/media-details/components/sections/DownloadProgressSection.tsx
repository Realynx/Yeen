import type { TorrentItem } from '../../../shared/services/types';
import {
  formatBytes,
  formatEta,
  formatRate,
} from '../../../player/services/torrentPrepareFormatting';

interface DownloadProgressSectionProps {
  torrent: TorrentItem;
  indexPendingReason?: string | null;
}

export function DownloadProgressSection({
  torrent,
  indexPendingReason = null,
}: DownloadProgressSectionProps) {
  const progressPercent = Math.min(100, Math.max(0, torrent.progress * 100));

  return (
    <section className="download-progress-panel" aria-live="polite">
      <div className="section-heading-row download-progress-heading">
        <h3 className="section-title">Active Download</h3>
        <span className="download-progress-percent">{progressPercent.toFixed(1)}%</span>
      </div>

      <div className="download-progress-track" aria-hidden="true">
        <div style={{ width: `${progressPercent}%` }} />
      </div>

      <p className="download-progress-meta">
        <span>
          {formatBytes(torrent.completedBytes)} of {formatBytes(torrent.sizeBytes)}
        </span>
        <span>{formatRate(torrent.downloadRate)}</span>
        <span>ETA {formatEta(torrent.etaSeconds)}</span>
      </p>

      <p className="download-progress-submeta">
        <span>State: {torrent.state || 'unknown'}</span>
        <span>Upload {formatRate(torrent.uploadRate)}</span>
      </p>

      {indexPendingReason ? (
        <p className="muted download-progress-reason">{indexPendingReason}</p>
      ) : null}
    </section>
  );
}
