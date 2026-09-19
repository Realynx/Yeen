import type { HlsSessionStats } from "../../../shared/services/types";
import type { PlayerVideoTelemetry } from "./PlayerVideoPanel.types";
import {
  describeNetworkState,
  describeReadyState,
  formatBandwidthUsage,
  formatStatPercent,
  formatStatSeconds,
  toStatsTimestamp,
} from "./playerVideoPanelStats.utils";

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
  estimatedBandwidthBps: number | null;
}

function StatGrid({ items }: { items: Array<[string, string | number]> }) {
  return <dl className="player-nerd-grid">{items.map(([label, value]) => (
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
  ))}</dl>;
}

function playbackStats(props: PlayerNerdStatsPanelProps): Array<[string, string | number]> {
  const telemetry = props.videoTelemetry;
  const renderedSize = telemetry?.renderedWidth && telemetry.renderedHeight
    ? `${telemetry.renderedWidth}x${telemetry.renderedHeight}` : 'n/a';
  return [
    ['Mode', props.isHlsSource ? 'HLS Transcode' : 'Direct Play'], ['Quality', props.qualityStatus],
    ['Rate', `${props.playbackRate.toFixed(2)}x`], ['Buffered', formatStatPercent(props.bufferedPercent)],
    ['Buffer Ahead', telemetry ? formatStatSeconds(telemetry.bufferedAheadSeconds) : 'n/a'],
    ['Ready State', telemetry ? describeReadyState(telemetry.readyState) : 'n/a'],
    ['Network State', telemetry ? describeNetworkState(telemetry.networkState) : 'n/a'],
    ['Dropped Frames', telemetry ? `${telemetry.droppedVideoFrames ?? 0}/${telemetry.totalVideoFrames ?? 0}` : 'n/a'],
    ['Render Size', renderedSize],
  ];
}

function transcoderStats(props: PlayerNerdStatsPanelProps): Array<[string, string | number]> {
  const stats = props.hlsSessionStats;
  const inflight = stats ? (stats.inflightSegments.length > 0 ? stats.inflightSegments.join(', ') : 'none') : 'n/a';
  const next = stats ? (stats.nextSegmentIndex ?? 'complete') : 'n/a';
  return [
    ['Session', props.streamSessionId ?? 'n/a'], ['Updated', toStatsTimestamp(props.hlsSessionStatsUpdatedAt)],
    ['Video Encoder', stats?.videoEncoder ?? 'n/a'],
    ['Segments', stats ? `${stats.readySegments}/${stats.totalSegments}` : 'n/a'],
    ['Ready %', stats ? formatStatPercent(stats.readyPercent) : 'n/a'],
    ['Contiguous', stats ? `${stats.contiguousReadySegments} (${formatStatSeconds(stats.readyThroughSeconds)})` : 'n/a'],
    ['Inflight', inflight], ['Next Segment', next], ['Recoveries', stats?.recoverableStartFailures ?? 'n/a'],
  ];
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
        <button
          type="button"
          className="player-menu-mini player-nerd-close"
          onClick={onToggleNerdStats}
        >
          Hide
        </button>
      </div>

      <section className="player-nerd-section">
        <h3>Playback</h3>
        <StatGrid items={playbackStats({ showNerdStats, onToggleNerdStats, isHlsSource,
          qualityStatus, playbackRate, bufferedPercent, videoTelemetry, streamSessionId,
          hlsSessionStatsUpdatedAt, hlsSessionStats, hlsSessionStatsError, streamUrl, estimatedBandwidthBps })} />
      </section>

      <section className="player-nerd-section">
        <h3>Transcoder</h3>
        <StatGrid items={transcoderStats({ showNerdStats, onToggleNerdStats, isHlsSource,
          qualityStatus, playbackRate, bufferedPercent, videoTelemetry, streamSessionId,
          hlsSessionStatsUpdatedAt, hlsSessionStats, hlsSessionStatsError, streamUrl, estimatedBandwidthBps })} />
        {hlsSessionStatsError ? (
          <p className="player-nerd-error">{hlsSessionStatsError}</p>
        ) : null}
      </section>

      <section className="player-nerd-section">
        <h3>Network</h3>
        <dl className="player-nerd-grid">
          <div>
            <dt>URL</dt>
            <dd className="is-mono" title={streamUrl ?? "n/a"}>
              {streamUrl ?? "n/a"}
            </dd>
          </div>
          <div>
            <dt>Effective Stream Throughput</dt>
            <dd>
              {isHlsSource
                ? formatBandwidthUsage(estimatedBandwidthBps)
                : "n/a"}
            </dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
