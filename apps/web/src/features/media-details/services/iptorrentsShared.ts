import type { IptorrentsSearchResponse } from '../../shared/services/types';
import type { NormalizedTorrentTitle } from './torrentTitleNormalization';

export interface IptorrentsResultsSectionProps {
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

export type IptSortField = 'size' | 'seeders' | 'leechers';
export type IptSortDirection = 'desc' | 'asc';

export interface AnnotatedTorrentResult {
  item: IptorrentsSearchResponse['results'][number];
  originalIndex: number;
  normalizedTitle: NormalizedTorrentTitle;
}

export interface EpisodeAggregateGroup {
  key: string;
  title: string;
  summary: string;
  entries: AnnotatedTorrentResult[];
  commonBadges: NormalizedTorrentTitle['badges'];
}

export type RenderableTorrentResult =
  | {
      kind: 'item';
      entry: AnnotatedTorrentResult;
    }
  | {
      kind: 'aggregate';
      group: EpisodeAggregateGroup;
    };

export const VIRTUALIZE_MIN_RESULTS = 32;
export const VIRTUAL_ROW_HEIGHT = 220;
export const VIRTUAL_OVERSCAN_ROWS = 4;
export const DEFAULT_VIRTUAL_VIEWPORT_HEIGHT = 560;

export function parseIptSizeToBytes(sizeLabel: string): number {
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

export function sortMetricValue(
  item: IptorrentsSearchResponse['results'][number],
  field: IptSortField,
): number {
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

function compareEpisodeEntries(
  left: AnnotatedTorrentResult,
  right: AnnotatedTorrentResult,
): number {
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
      if (
        typeof release.episodeEnd === 'number'
        && release.episodeEnd > release.episode
      ) {
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
    .filter((badge) =>
      entries.every((entry) =>
        entry.normalizedTitle.badges.some(
          (candidate) =>
            candidate.kind === badge.kind && candidate.label === badge.label,
        ),
      ),
    )
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

export function buildAggregatedResults(entries: AnnotatedTorrentResult[]): {
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
