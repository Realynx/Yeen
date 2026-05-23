import type { NormalizedTorrentTitle } from '../../services/torrentTitleNormalization';
import type {
  AnnotatedTorrentResult,
  EpisodeAggregateGroup,
  IptorrentsResultsSectionProps,
} from '../../services/iptorrentsShared';

interface IptResultActionsProps {
  canStartDownload: boolean;
  pendingAction: IptorrentsResultsSectionProps['pendingAction'];
  onStartStream: IptorrentsResultsSectionProps['onStartStream'];
  onStartDownload: IptorrentsResultsSectionProps['onStartDownload'];
}

function renderBadges(
  badges: NormalizedTorrentTitle['badges'],
  keyPrefix: string,
) {
  if (badges.length === 0) {
    return null;
  }

  return (
    <div className="ipt-result-name-badges" aria-label="Detected torrent tags">
      {badges.slice(0, 8).map((badge, badgeIndex) => (
        <span
          key={`${keyPrefix}-${badge.kind}-${badge.label}-${badgeIndex}`}
          className={`ipt-result-name-badge ipt-result-name-badge-${badge.kind}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

function IptResultActions({
  item,
  canStartDownload,
  pendingAction,
  onStartStream,
  onStartDownload,
  className,
}: {
  item: AnnotatedTorrentResult['item'];
  className?: string;
} & IptResultActionsProps) {
  if (!canStartDownload || !item.downloadUrl) {
    return null;
  }

  return (
    <div className={`ipt-result-actions${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="ghost-button small ipt-start-stream-button"
        disabled={!onStartStream || Boolean(pendingAction)}
        onClick={() => {
          void onStartStream?.(item);
        }}
      >
        {pendingAction?.id === item.id && pendingAction.mode === 'stream'
          ? 'Starting Stream...'
          : 'Stream'}
      </button>

      <button
        type="button"
        className="ghost-button small ipt-start-download-button"
        disabled={!onStartDownload || Boolean(pendingAction)}
        onClick={() => {
          void onStartDownload?.(item);
        }}
      >
        {pendingAction?.id === item.id && pendingAction.mode === 'download'
          ? 'Starting Download...'
          : 'Download'}
      </button>
    </div>
  );
}

export function IptorrentsResultCard({
  entry,
  canStartDownload,
  pendingAction,
  onStartStream,
  onStartDownload,
}: {
  entry: AnnotatedTorrentResult;
} & IptResultActionsProps) {
  const { item, normalizedTitle } = entry;
  const displayTitle = normalizedTitle.displayTitle || item.title;
  const rawTitleDiffers = normalizedTitle.rawTitle !== displayTitle;

  return (
    <article key={`${item.id}-${entry.originalIndex}`} className="ipt-result-card">
      <div className="ipt-result-top">
        <div className="ipt-result-main">
          <div className="ipt-result-title-stack">
            <a
              href={item.detailsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ipt-result-title"
              title={item.title}
            >
              {displayTitle}
            </a>
            {renderBadges(normalizedTitle.badges, `${item.id}-${entry.originalIndex}`)}
          </div>
        </div>

        <div className="ipt-result-side">
          <div className="ipt-result-flags">
            {item.isNew ? <span className="ipt-flag">New</span> : null}
            {item.isFreeleech ? (
              <span className="ipt-flag ipt-flag-free">Freeleech</span>
            ) : null}
          </div>

          <div className="ipt-result-swarm">
            <span className="ipt-meta-chip ipt-meta-chip-seeders">↑ {item.seeders}</span>
            <span className="ipt-meta-chip ipt-meta-chip-leechers">↓ {item.leechers}</span>
          </div>
        </div>
      </div>

      {rawTitleDiffers ? (
        <p className="ipt-result-original-name">Raw: {item.title}</p>
      ) : null}

      {item.subtitle ? <p className="ipt-result-subtitle">{item.subtitle}</p> : null}

      <div className="ipt-result-footer">
        <div className="ipt-result-meta">
          <span className="ipt-meta-chip ipt-meta-chip-category">{item.category}</span>
          <span className="ipt-meta-chip">{item.size}</span>
          <span className="ipt-meta-chip">Sn {item.snatches}</span>
        </div>

        <IptResultActions
          item={item}
          canStartDownload={canStartDownload}
          pendingAction={pendingAction}
          onStartStream={onStartStream}
          onStartDownload={onStartDownload}
        />
      </div>
    </article>
  );
}

export function IptorrentsAggregateCard({
  group,
  canStartDownload,
  pendingAction,
  onStartStream,
  onStartDownload,
}: {
  group: EpisodeAggregateGroup;
} & IptResultActionsProps) {
  const bestSeeded = group.entries.reduce<AnnotatedTorrentResult | null>(
    (best, entry) => {
      if (!best) {
        return entry;
      }

      return entry.item.seeders > best.item.seeders ? entry : best;
    },
    null,
  );

  return (
    <article key={`aggregate-${group.key}`} className="ipt-result-card ipt-result-card-aggregate">
      <div className="ipt-result-top">
        <div className="ipt-result-main">
          <div className="ipt-result-title-stack">
            <span className="ipt-result-title ipt-result-title-static">{group.title}</span>
            {renderBadges(group.commonBadges, `aggregate-${group.key}`)}
            <p className="ipt-result-subtitle ipt-result-aggregate-summary">{group.summary}</p>
          </div>
        </div>

        <div className="ipt-result-side">
          <div className="ipt-result-flags">
            <span className="ipt-flag ipt-flag-aggregate">{group.entries.length} Episodes</span>
          </div>
          {bestSeeded ? (
            <div className="ipt-result-swarm">
              <span className="ipt-meta-chip ipt-meta-chip-seeders">↑ {bestSeeded.item.seeders}</span>
              <span className="ipt-meta-chip ipt-meta-chip-leechers">↓ {bestSeeded.item.leechers}</span>
            </div>
          ) : null}
        </div>
      </div>

      <details className="ipt-aggregate-details">
        <summary>Show aggregated torrents</summary>
        <div className="ipt-aggregate-list">
          {group.entries.map((entry) => {
            const { item, normalizedTitle } = entry;
            const releaseLabel =
              normalizedTitle.release.label || `Result ${entry.originalIndex + 1}`;

            return (
              <div
                key={`aggregate-row-${item.id}-${entry.originalIndex}`}
                className="ipt-aggregate-row"
              >
                <span className="ipt-aggregate-row-label">{releaseLabel}</span>
                <a
                  href={item.detailsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ipt-aggregate-row-title"
                  title={item.title}
                >
                  {normalizedTitle.displayTitle}
                </a>
                <div className="ipt-aggregate-row-meta">
                  <span className="ipt-meta-chip ipt-meta-chip-seeders">↑ {item.seeders}</span>
                  <span className="ipt-meta-chip ipt-meta-chip-leechers">↓ {item.leechers}</span>
                  <span className="ipt-meta-chip">{item.size}</span>
                </div>
                <IptResultActions
                  item={item}
                  className="ipt-aggregate-row-actions"
                  canStartDownload={canStartDownload}
                  pendingAction={pendingAction}
                  onStartStream={onStartStream}
                  onStartDownload={onStartDownload}
                />
              </div>
            );
          })}
        </div>
      </details>
    </article>
  );
}
