import { clamp } from '../../services/playerUtils';
import type {
  HlsSessionStats,
  TorrentItem,
} from '../../../shared/services/types';
import type { PlayerVideoTelemetry } from './PlayerVideoPanel.types';
import {
  describeNetworkState,
  describeReadyState,
  formatBandwidthUsage,
  formatStatPercent,
  formatStatSeconds,
  toStatsTimestamp,
} from './playerVideoPanelStats';

interface PlayerNerdStatsPanelProps {
  showNerdStats: boolean;
  onToggleNerdStats: () => void;
  isHlsSource: boolean;
  qualityStatus: string;
  playbackRate: number;
  bufferedPercent: number;
  videoTelemetry: PlayerVideoTelemetry | null;
  streamSessionId: string | null;
  hlsSessionStatsUpdatedAt: string | null;
  hlsSessionStats: HlsSessionStats | null;
  hlsSessionStatsError: string | null;
  streamUrl: string | null;
  downloadingTorrent: TorrentItem | null;
  estimatedBandwidthBps: number | null;
}

export function PlayerNerdStatsPanel({
  showNerdStats,
  onToggleNerdStats,
  isHlsSource,
  qualityStatus,
  playbackRate,
  bufferedPercent,
  videoTelemetry,
  streamSessionId,
  hlsSessionStatsUpdatedAt,
  hlsSessionStats,
  hlsSessionStatsError,
  streamUrl,
  downloadingTorrent,
  estimatedBandwidthBps,
}: PlayerNerdStatsPanelProps) {
  if (!showNerdStats) {
    return null;
  }

  return (
    <aside
      className="player-nerd-stats player-menu player-menu-unified"
      aria-live="polite"
      aria-label="Playback debug details"
    >
      <div className="player-nerd-stats-header">
        <p className="player-menu-heading">Stats for Nerds</p>
        <button type="button" className="player-menu-mini player-nerd-close" onClick={onToggleNerdStats}>
          Hide
        </button>
      </div>

      <section className="player-nerd-section">
        <h3>Playback</h3>
        <dl className="player-nerd-grid">
          <div>
            <dt>Mode</dt>
            <dd>{isHlsSource ? 'HLS Transcode' : 'Direct Play'}</dd>
          </div>
          <div>
            <dt>Quality</dt>
            <dd>{qualityStatus}</dd>
          </div>
          <div>
            <dt>Rate</dt>
            <dd>{playbackRate.toFixed(2)}x</dd>
          </div>
          <div>
            <dt>Buffered</dt>
            <dd>{formatStatPercent(bufferedPercent)}</dd>
          </div>
          <div>
            <dt>Buffer Ahead</dt>
            <dd>{videoTelemetry ? formatStatSeconds(videoTelemetry.bufferedAheadSeconds) : 'n/a'}</dd>
          </div>
          <div>
            <dt>Ready State</dt>
            <dd>{videoTelemetry ? describeReadyState(videoTelemetry.readyState) : 'n/a'}</dd>
          </div>
          <div>
            <dt>Network State</dt>
            <dd>{videoTelemetry ? describeNetworkState(videoTelemetry.networkState) : 'n/a'}</dd>
          </div>
          <div>
            <dt>Dropped Frames</dt>
            <dd>
              {videoTelemetry
                ? `${videoTelemetry.droppedVideoFrames ?? 0}/${videoTelemetry.totalVideoFrames ?? 0}`
                : 'n/a'}
            </dd>
          </div>
          <div>
            <dt>Render Size</dt>
            <dd>
              {videoTelemetry?.renderedWidth && videoTelemetry?.renderedHeight
                ? `${videoTelemetry.renderedWidth}x${videoTelemetry.renderedHeight}`
                : 'n/a'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="player-nerd-section">
        <h3>Transcoder</h3>
        <dl className="player-nerd-grid">
          <div>
            <dt>Session</dt>
            <dd>{streamSessionId ?? 'n/a'}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{toStatsTimestamp(hlsSessionStatsUpdatedAt)}</dd>
          </div>
          <div>
            <dt>Segments</dt>
            <dd>
              {hlsSessionStats
                ? `${hlsSessionStats.readySegments}/${hlsSessionStats.totalSegments}`
                : 'n/a'}
            </dd>
          </div>
          <div>
            <dt>Ready %</dt>
            <dd>{hlsSessionStats ? formatStatPercent(hlsSessionStats.readyPercent) : 'n/a'}</dd>
          </div>
          <div>
            <dt>Contiguous</dt>
            <dd>
              {hlsSessionStats
                ? `${hlsSessionStats.contiguousReadySegments} (${formatStatSeconds(hlsSessionStats.readyThroughSeconds)})`
                : 'n/a'}
            </dd>
          </div>
          <div>
            <dt>Inflight</dt>
            <dd>
              {hlsSessionStats
                ? hlsSessionStats.inflightSegments.length > 0
                  ? hlsSessionStats.inflightSegments.join(', ')
                  : 'none'
                : 'n/a'}
            </dd>
          </div>
          <div>
            <dt>Next Segment</dt>
            <dd>
              {hlsSessionStats
                ? hlsSessionStats.nextSegmentIndex !== null
                  ? hlsSessionStats.nextSegmentIndex
                  : 'complete'
                : 'n/a'}
            </dd>
          </div>
          <div>
            <dt>Recoveries</dt>
            <dd>{hlsSessionStats ? hlsSessionStats.recoverableStartFailures : 'n/a'}</dd>
          </div>
        </dl>

        {hlsSessionStatsError ? <p className="player-nerd-error">{hlsSessionStatsError}</p> : null}
      </section>

      <section className="player-nerd-section">
        <h3>Network</h3>
        <dl className="player-nerd-grid">
          <div>
            <dt>URL</dt>
            <dd className="is-mono" title={streamUrl ?? 'n/a'}>
              {streamUrl ?? 'n/a'}
            </dd>
          </div>
          <div>
            <dt>Torrent</dt>
            <dd>{downloadingTorrent?.state ?? 'n/a'}</dd>
          </div>
          <div>
            <dt>Effective Stream Throughput</dt>
            <dd>{isHlsSource ? formatBandwidthUsage(estimatedBandwidthBps) : 'n/a'}</dd>
          </div>
          <div>
            <dt>Torrent Progress</dt>
            <dd>
              {downloadingTorrent
                ? formatStatPercent(clamp(downloadingTorrent.progress * 100, 0, 100))
                : 'n/a'}
            </dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
