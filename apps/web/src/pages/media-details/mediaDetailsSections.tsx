import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaChapterThumbnailUrl } from '../../lib/api';
import type {
  IptorrentsSearchResponse,
  MediaItem,
  ProgressEntry,
  TorrentItem,
} from '../../lib/types';
import { formatEta, formatRate } from '../player/torrentPrepareFormatting';
import {
  episodeDisplayTitle,
  episodeFrameImageUrl,
  formatBytes,
  formatDuration,
  formatTimestamp,
  isResumableProgress,
  playerHref,
  previewImageUrl,
  progressPercent,
} from './mediaDetailsUtils';
import {
  normalizeTorrentResultTitle,
  type NormalizedTorrentTitle,
} from './torrentTitleNormalization';

interface EpisodesSectionProps {
  seasonGroups: Array<[number, MediaItem[]]>;
  activeSeason: number | null;
  activeSeasonEpisodes: MediaItem[];
  progressById: Map<string, ProgressEntry>;
  onSelectSeason: (season: number) => void;
  onNavigate: (to: string) => void;
  isAdmin?: boolean;
  onEditEpisode?: (episode: MediaItem) => void;
}

export function EpisodesSection({
  seasonGroups,
  activeSeason,
  activeSeasonEpisodes,
  progressById,
  onSelectSeason,
  onNavigate,
  isAdmin,
  onEditEpisode,
}: EpisodesSectionProps) {
  return (
    <section>
      <div className="section-heading-row">
        <h3 className="section-title">Episodes</h3>
        {seasonGroups.length > 1 ? (
          <div className="season-tabs" role="tablist">
            {seasonGroups.map(([seasonNumber, episodes]) => {
              const isActive = activeSeason === seasonNumber;
              return (
                <button
                  key={`season-tab-${seasonNumber}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`season-tab${isActive ? ' is-active' : ''}`}
                  onClick={() => onSelectSeason(seasonNumber)}
                >
                  {seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`}
                  <span className="season-tab-count">{episodes.length}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {activeSeasonEpisodes.length === 0 ? (
        <p className="muted">No episodes were indexed for this show.</p>
      ) : (
        <div className="episode-card-list">
          {activeSeasonEpisodes.map((episode) => {
            const episodeImage = episodeFrameImageUrl(episode);
            const episodeProgress = progressById.get(episode.id);
            const episodePercent = progressPercent(episodeProgress);
            const watched = Boolean(episodeProgress?.completed);
            const inProgress = isResumableProgress(episodeProgress);

            return (
              <div
                key={episode.id}
                className={`episode-card${watched ? ' is-watched' : ''}${inProgress ? ' is-in-progress' : ''}`}
                onClick={() => onNavigate(playerHref(episode.id, episodeProgress))}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate(playerHref(episode.id, episodeProgress)); }}
              >
                <div className="episode-card-thumb" aria-hidden="true">
                  {episodeImage ? (
                    <img src={episodeImage} alt="" loading="lazy" decoding="async" />
                  ) : (
                    <span className="episode-thumb-fallback">
                      {String(episode.episodeNumber ?? '?').padStart(2, '0')}
                    </span>
                  )}
                  <span className="episode-play-overlay" aria-hidden="true">▶</span>
                  {watched ? <span className="episode-watched-badge">✓ Watched</span> : null}
                  {inProgress ? (
                    <div className="episode-progress" aria-hidden="true">
                      <div style={{ width: `${episodePercent}%` }} />
                    </div>
                  ) : null}
                </div>

                <div className="episode-info">
                  <div className="episode-info-header">
                    <p className="episode-code">
                      S{String(episode.seasonNumber ?? 0).padStart(2, '0')}E{String(episode.episodeNumber ?? 0).padStart(2, '0')}
                      <span className="episode-runtime"> · {formatDuration(episode.durationSeconds)}</span>
                    </p>
                    {isAdmin && onEditEpisode ? (
                      <button
                        type="button"
                        className="episode-edit-btn"
                        aria-label={`Edit metadata for ${episodeDisplayTitle(episode)}`}
                        onClick={(e) => { e.stopPropagation(); onEditEpisode(episode); }}
                      >
                        ✎
                      </button>
                    ) : null}
                  </div>
                  <h4 className="episode-title">{episodeDisplayTitle(episode)}</h4>
                  {episode.description?.trim() ? (
                    <p className="episode-description">{episode.description}</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface SeriesCollectionSectionProps {
  current: MediaItem;
  relatedMovies: MediaItem[];
  progressById: Map<string, ProgressEntry>;
  onNavigate: (to: string) => void;
  isAdmin?: boolean;
  onEditMovie?: (movie: MediaItem) => void;
}

export function SeriesCollectionSection({
  current,
  relatedMovies,
  progressById,
  onNavigate,
  isAdmin,
  onEditMovie,
}: SeriesCollectionSectionProps) {
  return (
    <section>
      <h3 className="section-title">In This Collection</h3>
      <p className="section-subtitle">
        Related movies grouped by title and franchise.
      </p>
      <div className="series-grid">
        {relatedMovies.map((movie) => {
          const movieImage = previewImageUrl(movie);
          const movieProgress = progressById.get(movie.id);
          const moviePercent = progressPercent(movieProgress);
          const isCurrent = movie.id === current.id;

          return (
            <div
              key={movie.id}
              className={`series-card${isCurrent ? ' is-current' : ''}`}
              onClick={() => onNavigate(`/details/${movie.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onNavigate(`/details/${movie.id}`); }}
            >
              <div className="series-card-thumb" aria-hidden="true">
                {movieImage ? (
                  <img src={movieImage} alt={movie.title} loading="lazy" decoding="async" />
                ) : (
                  <span>{movie.title.slice(0, 1).toUpperCase()}</span>
                )}
                {isResumableProgress(movieProgress) ? (
                  <div className="episode-progress" aria-hidden="true">
                    <div style={{ width: `${moviePercent}%` }} />
                  </div>
                ) : null}
                {movieProgress?.completed ? (
                  <span className="episode-watched-badge">✓</span>
                ) : null}
              </div>
              <h4>{movie.title}</h4>
              <p>{movie.releaseYear ?? 'Unknown year'} · {formatDuration(movie.durationSeconds)}</p>
              {isAdmin && onEditMovie ? (
                <button
                  type="button"
                  className="series-card-edit-btn"
                  aria-label={`Edit metadata for ${movie.title}`}
                  onClick={(e) => { e.stopPropagation(); onEditMovie(movie); }}
                >
                  ✎ Edit
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface ScenePreviewsSectionProps {
  current: MediaItem;
  onNavigate: (to: string) => void;
}

export function ScenePreviewsSection({ current, onNavigate }: ScenePreviewsSectionProps) {
  if (current.chapterThumbnails.length === 0) {
    return null;
  }

  return (
    <section>
      <h3 className="section-title">Scene Previews</h3>
      <p className="section-subtitle">
        Jump straight into a moment — preview frames captured during scanning.
      </p>
      <div className="chapter-grid">
        {current.chapterThumbnails.map((thumbnail, index) => (
          <button
            key={`${current.id}-chapter-${index}`}
            type="button"
            className="chapter-thumb"
            onClick={() => {
              const targetSecond = Math.max(0, Math.floor(thumbnail.second));
              onNavigate(`/player/${current.id}?t=${targetSecond}`);
            }}
            title={`Jump near ${formatTimestamp(thumbnail.second)}`}
          >
            <img
              src={mediaChapterThumbnailUrl(current.id, index)}
              alt={`${current.title} chapter ${index + 1}`}
              loading="lazy"
              decoding="async"
            />
            <span>{formatTimestamp(thumbnail.second)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

interface TechnicalDetailsSectionProps {
  current: MediaItem;
}

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
        <span>{formatBytes(torrent.completedBytes)} of {formatBytes(torrent.sizeBytes)}</span>
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

interface IptorrentsResultsSectionProps {
  queryTitle: string;
  trackerLabel?: string;
  panelId?: string;
  searchUrl: string;
  showLocalControls?: boolean;
  enableEpisodeAggregation?: boolean;
  disableVirtualization?: boolean;
  loading: boolean;
  hasSearchRequest?: boolean;
  error: string | null;
  response: IptorrentsSearchResponse | null;
  canStartDownload?: boolean;
  pendingAction?: { id: string; mode: 'stream' | 'download' } | null;
  actionMessage?: string | null;
  actionError?: string | null;
  onRetrySearch?: (() => void) | null;
  onStartStream?: (
    item: IptorrentsSearchResponse['results'][number],
  ) => Promise<void> | void;
  onStartDownload?: (
    item: IptorrentsSearchResponse['results'][number],
  ) => Promise<void> | void;
}

type IptSortField = 'size' | 'seeders' | 'leechers';
type IptSortDirection = 'desc' | 'asc';

interface AnnotatedTorrentResult {
  item: IptorrentsSearchResponse['results'][number];
  originalIndex: number;
  normalizedTitle: NormalizedTorrentTitle;
}

interface EpisodeAggregateGroup {
  key: string;
  title: string;
  summary: string;
  entries: AnnotatedTorrentResult[];
  commonBadges: NormalizedTorrentTitle['badges'];
}

type RenderableTorrentResult =
  | {
    kind: 'item';
    entry: AnnotatedTorrentResult;
  }
  | {
    kind: 'aggregate';
    group: EpisodeAggregateGroup;
  };

const VIRTUALIZE_MIN_RESULTS = 32;
const VIRTUAL_ROW_HEIGHT = 220;
const VIRTUAL_OVERSCAN_ROWS = 4;
const DEFAULT_VIRTUAL_VIEWPORT_HEIGHT = 560;

function parseIptSizeToBytes(sizeLabel: string): number {
  const match = sizeLabel.trim().match(/^([\d.,]+)\s*([kmgt]?i?b)$/i);
  if (!match?.[1] || !match[2]) {
    return 0;
  }

  const value = Number.parseFloat(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) {
    return 0;
  }

  const rawUnit = match[2].toUpperCase();
  const isIecUnit = rawUnit.includes('IB');
  const unit = rawUnit.replace('IB', 'B');
  const decimalMultipliers: Record<string, number> = {
    B: 1,
    KB: 1_000,
    MB: 1_000_000,
    GB: 1_000_000_000,
    TB: 1_000_000_000_000,
  };

  const iecMultipliers: Record<string, number> = {
    B: 1,
    KB: 1_024,
    MB: 1_048_576,
    GB: 1_073_741_824,
    TB: 1_099_511_627_776,
  };

  const multipliers = isIecUnit ? iecMultipliers : decimalMultipliers;

  return Math.round(value * (multipliers[unit] ?? 1));
}

function sortMetricValue(item: IptorrentsSearchResponse['results'][number], field: IptSortField): number {
  if (field === 'size') {
    return parseIptSizeToBytes(item.size);
  }

  if (field === 'seeders') {
    return item.seeders;
  }

  return item.leechers;
}

function padAggregateEpisode(value: number): string {
  if (value >= 100) {
    return String(value);
  }

  return String(value).padStart(2, '0');
}

function compareEpisodeEntries(left: AnnotatedTorrentResult, right: AnnotatedTorrentResult): number {
  const leftSort = left.normalizedTitle.episodeSortKey;
  const rightSort = right.normalizedTitle.episodeSortKey;

  if (typeof leftSort === 'number' && typeof rightSort === 'number') {
    return leftSort - rightSort;
  }

  if (typeof leftSort === 'number') {
    return -1;
  }

  if (typeof rightSort === 'number') {
    return 1;
  }

  return left.originalIndex - right.originalIndex;
}

function episodeIdentity(entry: AnnotatedTorrentResult): string | null {
  const release = entry.normalizedTitle.release;
  if (release.episode === null) {
    return null;
  }

  return `${release.season ?? 0}:${release.episode}:${release.episodeEnd ?? release.episode}`;
}

function formatAggregateEpisodeScope(entries: AnnotatedTorrentResult[]): string | null {
  const episodeNumbers: number[] = [];
  const seasonValues: number[] = [];

  for (const entry of entries) {
    const release = entry.normalizedTitle.release;
    if (typeof release.season === 'number') {
      seasonValues.push(release.season);
    }

    if (typeof release.episode === 'number') {
      episodeNumbers.push(release.episode);
      if (typeof release.episodeEnd === 'number' && release.episodeEnd > release.episode) {
        episodeNumbers.push(release.episodeEnd);
      }
    }
  }

  if (episodeNumbers.length === 0) {
    return null;
  }

  episodeNumbers.sort((left, right) => left - right);
  const start = episodeNumbers[0];
  const end = episodeNumbers[episodeNumbers.length - 1];
  const uniqueSeasonValues = Array.from(new Set(seasonValues));
  const singleSeason = uniqueSeasonValues.length === 1;
  const season = uniqueSeasonValues[0];

  if (singleSeason && typeof season === 'number') {
    const seasonLabel = `S${String(season).padStart(2, '0')}`;
    if (start === end) {
      return `${seasonLabel}E${padAggregateEpisode(start)}`;
    }

    return `${seasonLabel}E${padAggregateEpisode(start)}-E${padAggregateEpisode(end)}`;
  }

  if (start === end) {
    return `Episode ${padAggregateEpisode(start)}`;
  }

  return `Episodes ${padAggregateEpisode(start)}-${padAggregateEpisode(end)}`;
}

function findCommonBadges(entries: AnnotatedTorrentResult[]): NormalizedTorrentTitle['badges'] {
  if (entries.length === 0) {
    return [];
  }

  const first = entries[0]?.normalizedTitle.badges ?? [];
  if (first.length === 0) {
    return [];
  }

  return first
    .filter((badge) => entries.every((entry) =>
      entry.normalizedTitle.badges.some((candidate) =>
        candidate.kind === badge.kind && candidate.label === badge.label,
      )))
    .slice(0, 6);
}

function buildEpisodeAggregateGroup(
  key: string,
  entries: AnnotatedTorrentResult[],
): EpisodeAggregateGroup {
  const sortedEntries = [...entries].sort(compareEpisodeEntries);
  const first = sortedEntries[0];
  const episodeScope = formatAggregateEpisodeScope(sortedEntries);
  const title = episodeScope
    ? `${first.normalizedTitle.baseTitle} · ${episodeScope}`
    : `${first.normalizedTitle.baseTitle} · Episode Bundle`;

  return {
    key,
    title,
    summary: `Aggregated ${sortedEntries.length} related episode torrents with matching release tags.`,
    entries: sortedEntries,
    commonBadges: findCommonBadges(sortedEntries),
  };
}

function buildAggregatedResults(entries: AnnotatedTorrentResult[]): {
  entries: RenderableTorrentResult[];
  groupCount: number;
} {
  const groupedByKey = new Map<string, AnnotatedTorrentResult[]>();

  for (const entry of entries) {
    const key = entry.normalizedTitle.aggregationKey;
    const releaseKind = entry.normalizedTitle.release.kind;
    if (!key || (releaseKind !== 'episode' && releaseKind !== 'range')) {
      continue;
    }

    const bucket = groupedByKey.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      groupedByKey.set(key, [entry]);
    }
  }

  const aggregatableKeys = new Set<string>();
  for (const [key, bucket] of groupedByKey) {
    if (bucket.length < 2) {
      continue;
    }

    const uniqueEpisodes = new Set(
      bucket
        .map((entry) => episodeIdentity(entry))
        .filter((value): value is string => Boolean(value)),
    );

    if (uniqueEpisodes.size >= 2) {
      aggregatableKeys.add(key);
    }
  }

  const consumed = new Set<string>();
  const renderEntries: RenderableTorrentResult[] = [];
  let groupCount = 0;

  for (const entry of entries) {
    const consumeKey = `${entry.item.id}:${entry.originalIndex}`;
    if (consumed.has(consumeKey)) {
      continue;
    }

    const aggregateKey = entry.normalizedTitle.aggregationKey;
    if (!aggregatableKeys.has(aggregateKey)) {
      renderEntries.push({
        kind: 'item',
        entry,
      });
      consumed.add(consumeKey);
      continue;
    }

    const bucket = groupedByKey.get(aggregateKey) ?? [];
    if (bucket.length <= 1) {
      renderEntries.push({
        kind: 'item',
        entry,
      });
      consumed.add(consumeKey);
      continue;
    }

    for (const groupedEntry of bucket) {
      consumed.add(`${groupedEntry.item.id}:${groupedEntry.originalIndex}`);
    }

    renderEntries.push({
      kind: 'aggregate',
      group: buildEpisodeAggregateGroup(aggregateKey, bucket),
    });
    groupCount += 1;
  }

  return {
    entries: renderEntries,
    groupCount,
  };
}

export function IptorrentsResultsSection({
  queryTitle,
  trackerLabel = 'IPTorrents',
  panelId,
  searchUrl,
  showLocalControls = true,
  enableEpisodeAggregation = false,
  disableVirtualization = false,
  loading,
  hasSearchRequest = false,
  error,
  response,
  canStartDownload = false,
  pendingAction = null,
  actionMessage = null,
  actionError = null,
  onRetrySearch = null,
  onStartStream,
  onStartDownload,
}: IptorrentsResultsSectionProps) {
  const results = response?.results ?? [];
  const totalMatches = response?.total ?? results.length;
  const [sortField, setSortField] = useState<IptSortField>('seeders');
  const [sortDirection, setSortDirection] = useState<IptSortDirection>('desc');
  const [nameFilter, setNameFilter] = useState('');
  const [virtualScrollTop, setVirtualScrollTop] = useState(0);
  const [virtualViewportHeight, setVirtualViewportHeight] = useState(
    DEFAULT_VIRTUAL_VIEWPORT_HEIGHT,
  );
  const virtualScrollRef = useRef<HTMLDivElement | null>(null);

  const annotatedResults = useMemo<AnnotatedTorrentResult[]>(() =>
    results.map((item, originalIndex) => ({
      item,
      originalIndex,
      normalizedTitle: normalizeTorrentResultTitle(item.title, queryTitle),
    })), [queryTitle, results]);

  const normalizedNameFilter = nameFilter.trim().toLowerCase();
  const hasLocalFilter = normalizedNameFilter.length > 0;

  const locallyFilteredResults = useMemo(() => {
    if (!showLocalControls) {
      return annotatedResults;
    }

    if (!hasLocalFilter) {
      return annotatedResults;
    }

    return annotatedResults.filter((entry) => {
      const badgeText = entry.normalizedTitle.badges
        .map((badge) => badge.label)
        .join(' ');
      const haystack = [
        entry.item.title,
        entry.item.subtitle ?? '',
        entry.item.category,
        entry.normalizedTitle.displayTitle,
        badgeText,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedNameFilter);
    });
  }, [annotatedResults, hasLocalFilter, normalizedNameFilter, showLocalControls]);

  const sortedResults = useMemo(() => {
    if (!showLocalControls) {
      return locallyFilteredResults;
    }

    return locallyFilteredResults
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => {
        const leftValue = sortMetricValue(left.entry.item, sortField);
        const rightValue = sortMetricValue(right.entry.item, sortField);
        const delta =
          sortDirection === 'desc'
            ? rightValue - leftValue
            : leftValue - rightValue;

        if (delta !== 0) {
          return delta;
        }

        return left.index - right.index;
      })
      .map((entry) => entry.entry);
  }, [locallyFilteredResults, showLocalControls, sortDirection, sortField]);

  const shouldVirtualize =
    !disableVirtualization
    && !enableEpisodeAggregation
    && sortedResults.length >= VIRTUALIZE_MIN_RESULTS;

  useEffect(() => {
    setVirtualScrollTop(0);
    if (virtualScrollRef.current) {
      virtualScrollRef.current.scrollTop = 0;
    }
  }, [sortedResults, sortDirection, sortField, showLocalControls]);

  useEffect(() => {
    if (!shouldVirtualize) {
      return;
    }

    const container = virtualScrollRef.current;
    if (!container) {
      return;
    }

    const updateViewportHeight = () => {
      setVirtualViewportHeight(
        container.clientHeight || DEFAULT_VIRTUAL_VIEWPORT_HEIGHT,
      );
    };

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    return () => {
      window.removeEventListener('resize', updateViewportHeight);
    };
  }, [shouldVirtualize]);

  const virtualVisibleRange = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        startIndex: 0,
        endIndex: sortedResults.length,
      };
    }

    const estimatedStart = Math.floor(virtualScrollTop / VIRTUAL_ROW_HEIGHT);
    const startIndex = Math.max(0, estimatedStart - VIRTUAL_OVERSCAN_ROWS);
    const visibleRowCount = Math.ceil(virtualViewportHeight / VIRTUAL_ROW_HEIGHT);
    const endIndex = Math.min(
      sortedResults.length,
      startIndex + visibleRowCount + VIRTUAL_OVERSCAN_ROWS * 2,
    );

    return {
      startIndex,
      endIndex,
    };
  }, [shouldVirtualize, sortedResults.length, virtualScrollTop, virtualViewportHeight]);

  const visibleResults = sortedResults.slice(
    virtualVisibleRange.startIndex,
    virtualVisibleRange.endIndex,
  );

  const aggregatedVisibleResults = useMemo(() => {
    if (!enableEpisodeAggregation || shouldVirtualize) {
      return {
        entries: visibleResults.map<RenderableTorrentResult>((entry) => ({
          kind: 'item',
          entry,
        })),
        groupCount: 0,
      };
    }

    return buildAggregatedResults(visibleResults);
  }, [enableEpisodeAggregation, shouldVirtualize, visibleResults]);

  const topSpacerHeight = shouldVirtualize
    ? virtualVisibleRange.startIndex * VIRTUAL_ROW_HEIGHT
    : 0;
  const bottomSpacerHeight = shouldVirtualize
    ? Math.max(
      0,
      (sortedResults.length - virtualVisibleRange.endIndex) * VIRTUAL_ROW_HEIGHT,
    )
    : 0;

  const renderBadges = (
    badges: NormalizedTorrentTitle['badges'],
    keyPrefix: string,
  ) => {
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
  };

  const renderResultCard = (entry: AnnotatedTorrentResult) => {
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

        {item.subtitle ? (
          <p className="ipt-result-subtitle">{item.subtitle}</p>
        ) : null}

        <div className="ipt-result-footer">
          <div className="ipt-result-meta">
            <span className="ipt-meta-chip ipt-meta-chip-category">{item.category}</span>
            <span className="ipt-meta-chip">{item.size}</span>
            <span className="ipt-meta-chip">Sn {item.snatches}</span>
          </div>

          {canStartDownload && item.downloadUrl ? (
            <div className="ipt-result-actions">
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
          ) : null}
        </div>
      </article>
    );
  };

  const renderAggregateCard = (group: EpisodeAggregateGroup) => {
    const bestSeeded = group.entries.reduce<AnnotatedTorrentResult | null>((best, entry) => {
      if (!best) {
        return entry;
      }

      return entry.item.seeders > best.item.seeders ? entry : best;
    }, null);

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
              const releaseLabel = normalizedTitle.release.label
                || `Result ${entry.originalIndex + 1}`;

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
                  {canStartDownload && item.downloadUrl ? (
                    <div className="ipt-result-actions ipt-aggregate-row-actions">
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
                  ) : null}
                </div>
              );
            })}
          </div>
        </details>
      </article>
    );
  };

  return (
    <section
      id={panelId}
      role={panelId ? 'tabpanel' : undefined}
      aria-label={panelId ? `${trackerLabel} search results` : undefined}
    >
      <div className="section-heading-row ipt-results-heading">
        <div>
          <h3 className="section-title">{trackerLabel} Results</h3>
          <p className="section-subtitle">
            Results for {queryTitle} from {trackerLabel}.
          </p>
        </div>
        <a
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ghost-button small"
        >
          Open {trackerLabel}
        </a>
      </div>

      {loading ? <p className="muted">Searching {trackerLabel}...</p> : null}

      {!loading && error ? (
        <p className="error-text">{error}</p>
      ) : null}

      {!loading && error && onRetrySearch ? (
        <button
          type="button"
          className="ghost-button small ipt-retry-button"
          onClick={onRetrySearch}
        >
          Retry Search
        </button>
      ) : null}

      {actionMessage ? (
        <p className="muted ipt-download-feedback">{actionMessage}</p>
      ) : null}

      {actionError ? (
        <p className="error-text ipt-download-feedback">{actionError}</p>
      ) : null}

      {!loading && !error && hasSearchRequest && results.length === 0 ? (
        <p className="muted">No torrent matches were returned from {trackerLabel} for this title.</p>
      ) : null}

      {!loading && !error && results.length > 0 ? (
        <>
          {showLocalControls ? (
            <div className="ipt-sort-toolbar" role="group" aria-label={`Sort ${trackerLabel} results`}>
              <span className="ipt-sort-label">Sort by</span>
              <div className="ipt-sort-options">
                <button
                  type="button"
                  className={`ipt-sort-chip${sortField === 'size' ? ' is-active' : ''}`}
                  onClick={() => setSortField('size')}
                >
                  Size
                </button>
                <button
                  type="button"
                  className={`ipt-sort-chip${sortField === 'seeders' ? ' is-active' : ''}`}
                  onClick={() => setSortField('seeders')}
                >
                  Seeders
                </button>
                <button
                  type="button"
                  className={`ipt-sort-chip${sortField === 'leechers' ? ' is-active' : ''}`}
                  onClick={() => setSortField('leechers')}
                >
                  Leechers
                </button>
              </div>
              <button
                type="button"
                className="ipt-sort-direction"
                onClick={() =>
                  setSortDirection((current) =>
                    current === 'desc' ? 'asc' : 'desc',
                  )
                }
              >
                {sortDirection === 'desc' ? 'High to low' : 'Low to high'}
              </button>
              <label className="ipt-local-filter">
                <span className="ipt-local-filter-label">Filter names</span>
                <input
                  type="text"
                  value={nameFilter}
                  onChange={(event) => setNameFilter(event.target.value)}
                  placeholder="Filter results locally"
                />
              </label>
            </div>
          ) : null}

          <p className="ipt-results-summary">
            Showing {sortedResults.length} result{sortedResults.length === 1 ? '' : 's'}
            {showLocalControls && hasLocalFilter
              ? ` matching "${nameFilter.trim()}"`
              : ''}
            {totalMatches > sortedResults.length
              ? ` of ${totalMatches} total matches`
              : ''}.
            {enableEpisodeAggregation && aggregatedVisibleResults.groupCount > 0
              ? ` Grouped into ${aggregatedVisibleResults.groupCount} episode bundle${aggregatedVisibleResults.groupCount === 1 ? '' : 's'}.`
              : ''}
          </p>

          {showLocalControls && sortedResults.length === 0 ? (
            <p className="muted">No results match the local name filter.</p>
          ) : (
            shouldVirtualize ? (
              <div
                ref={virtualScrollRef}
                className="ipt-results-virtual-scroll"
                onScroll={(event) => {
                  const nextScrollTop = event.currentTarget.scrollTop;
                  setVirtualScrollTop((currentScrollTop) => {
                    const currentRow = Math.floor(currentScrollTop / VIRTUAL_ROW_HEIGHT);
                    const nextRow = Math.floor(nextScrollTop / VIRTUAL_ROW_HEIGHT);
                    return currentRow === nextRow ? currentScrollTop : nextScrollTop;
                  });
                }}
              >
                <div
                  className="ipt-results-virtual-spacer"
                  style={{ height: `${topSpacerHeight}px` }}
                  aria-hidden="true"
                />

                <div className="ipt-results-list ipt-results-list-virtualized">
                  {visibleResults.map((entry) => renderResultCard(entry))}
                </div>

                <div
                  className="ipt-results-virtual-spacer"
                  style={{ height: `${bottomSpacerHeight}px` }}
                  aria-hidden="true"
                />
              </div>
            ) : (
              <div className="ipt-results-list">
                {aggregatedVisibleResults.entries.map((entry) =>
                  entry.kind === 'item'
                    ? renderResultCard(entry.entry)
                    : renderAggregateCard(entry.group))}
              </div>
            )
          )}
        </>
      ) : null}
    </section>
  );
}

export function TechnicalDetailsSection({ current }: TechnicalDetailsSectionProps) {
  const subtitleDetails = current.subtitleDetails ?? [];
  const mediaDetails = current.mediaDetails;

  return (
    <section>
      <h3 className="section-title">Technical Details</h3>
      <div className="movie-details-grid tech-grid">
        <article>
          <h4>Container</h4>
          <p>{current.container ?? current.extension.replace('.', '').toUpperCase()}</p>
        </article>
        <article>
          <h4>Video</h4>
          <p>
            {current.videoCodec ? current.videoCodec.toUpperCase() : 'Unknown'}
            {current.width && current.height ? ` · ${current.width}×${current.height}` : ''}
            {mediaDetails?.frameRate ? ` · ${mediaDetails.frameRate.toFixed(2)}fps` : ''}
          </p>
        </article>
        <article>
          <h4>Audio</h4>
          <p>
            {current.audioCodec ? current.audioCodec.toUpperCase() : 'Unknown'}
            {mediaDetails?.audioChannels ? ` · ${mediaDetails.audioChannels}ch` : ''}
          </p>
        </article>
        <article>
          <h4>Bitrate</h4>
          <p>
            {mediaDetails?.bitRate
              ? `${(mediaDetails.bitRate / 1_000_000).toFixed(2)} Mbps`
              : 'Unknown'}
          </p>
        </article>
        <article>
          <h4>File Size</h4>
          <p>{formatBytes(current.sizeBytes)}</p>
        </article>
        <article>
          <h4>Path</h4>
          <p className="mono-text">{current.relativePath}</p>
        </article>
      </div>

      {subtitleDetails.length > 0 ? (
        <>
          <h3 className="section-title">Subtitles</h3>
          <div className="subtitle-pill-list">
            {subtitleDetails.map((track, index) => (
              <span key={`${track.source}-${index}`} className="subtitle-pill">
                <strong>{track.label || track.language || 'Track'}</strong>
                <span className="subtitle-pill-kind">{track.kind}</span>
              </span>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
