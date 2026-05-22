import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  bulkAssignEpisodes,
  toApiErrorMessage,
  updateMediaMetadata,
  type MediaMetadataPatch,
  type MetadataSearchCandidate,
} from '../lib/api';
import { parseSeasonEpisodeFromPath } from '../lib/filename-parse';
import { useMetadataSuggestions } from '../lib/use-metadata-suggestions';
import type { MediaItem } from '../lib/types';
import { MetadataSuggestionList } from './MetadataSuggestionList';

interface AssignToShowDialogProps {
  token: string;
  selectedItems: MediaItem[];
  onClose: () => void;
  onAssigned: (count: number) => void;
}

type EpisodeOrder =
  | 'detect-from-filename'
  | 'filename-asc'
  | 'existing-episode'
  | 'as-provided';

interface AssignmentRow {
  item: MediaItem;
  seasonNumber: number;
  episodeNumber: number;
  detected: boolean;
}

function naturalCompare(left: string, right: string): number {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function sortItems(items: MediaItem[], order: EpisodeOrder): MediaItem[] {
  if (order === 'as-provided') {
    return [...items];
  }

  if (order === 'existing-episode') {
    return [...items].sort((left, right) => {
      const ls = left.seasonNumber ?? Number.MAX_SAFE_INTEGER;
      const rs = right.seasonNumber ?? Number.MAX_SAFE_INTEGER;
      if (ls !== rs) return ls - rs;
      const le = left.episodeNumber ?? Number.MAX_SAFE_INTEGER;
      const re = right.episodeNumber ?? Number.MAX_SAFE_INTEGER;
      if (le !== re) return le - re;
      return naturalCompare(left.relativePath, right.relativePath);
    });
  }

  // detect-from-filename and filename-asc both start from a natural sort
  // on relative path so detected episodes group cleanly per season.
  return [...items].sort((left, right) =>
    naturalCompare(left.relativePath, right.relativePath),
  );
}

function buildAssignmentRows(
  items: MediaItem[],
  order: EpisodeOrder,
  defaultSeason: number,
  startEpisode: number,
): AssignmentRow[] {
  const sorted = sortItems(items, order);

  if (order === 'detect-from-filename') {
    const rows: AssignmentRow[] = [];
    // Per-season counters for items where detection failed — these are
    // numbered after the highest detected episode for that season so
    // sequential fallback numbers can't collide with explicit ones.
    const fallbackPerSeason = new Map<number, number>();
    const highestPerSeason = new Map<number, number>();

    const detections = sorted.map((item) => {
      const parsed = parseSeasonEpisodeFromPath(item.relativePath);
      const season = parsed.seasonNumber ?? defaultSeason;
      const episode = parsed.episodeNumber ?? null;
      if (episode !== null) {
        const prev = highestPerSeason.get(season) ?? 0;
        if (episode > prev) highestPerSeason.set(season, episode);
      }
      return { item, season, episode };
    });

    for (const { item, season, episode } of detections) {
      if (episode !== null) {
        rows.push({ item, seasonNumber: season, episodeNumber: episode, detected: true });
        continue;
      }
      const seed =
        fallbackPerSeason.get(season) ??
        Math.max(highestPerSeason.get(season) ?? 0, startEpisode - 1);
      const next = seed + 1;
      fallbackPerSeason.set(season, next);
      rows.push({ item, seasonNumber: season, episodeNumber: next, detected: false });
    }

    return rows;
  }

  if (order === 'existing-episode') {
    let fallbackEpisode = startEpisode;
    return sorted.map((item) => {
      const season = item.seasonNumber ?? defaultSeason;
      const episode = item.episodeNumber ?? fallbackEpisode++;
      return {
        item,
        seasonNumber: season,
        episodeNumber: episode,
        detected: item.episodeNumber !== null,
      };
    });
  }

  // filename-asc / as-provided: sequential under the default season.
  return sorted.map((item, index) => ({
    item,
    seasonNumber: defaultSeason,
    episodeNumber: startEpisode + index,
    detected: false,
  }));
}

function rowsShareSeason(rows: AssignmentRow[]): boolean {
  if (rows.length === 0) return true;
  const first = rows[0].seasonNumber;
  return rows.every((row) => row.seasonNumber === first);
}

function normalizeTagsForInput(tags: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }

  const deduped = new Map<string, string>();
  for (const tag of tags) {
    if (typeof tag !== 'string') {
      continue;
    }

    const cleaned = tag.trim();
    if (!cleaned) {
      continue;
    }

    const key = cleaned.toLowerCase();
    if (!deduped.has(key)) {
      deduped.set(key, cleaned);
    }
  }

  return [...deduped.values()].sort((left, right) =>
    left.localeCompare(right, undefined, { sensitivity: 'base' }),
  );
}

function toMediaTimestamp(item: MediaItem): number {
  const refreshedAt = Date.parse(item.metadataRefreshedAt);
  const updatedAt = Date.parse(item.updatedAt);
  const refreshed = Number.isFinite(refreshedAt) ? refreshedAt : 0;
  const updated = Number.isFinite(updatedAt) ? updatedAt : 0;
  return Math.max(refreshed, updated);
}

function initialTagsInputFromSelection(items: MediaItem[]): string {
  const candidate = [...items].sort((left, right) => {
    const rightCount = Array.isArray(right.tags) ? right.tags.length : 0;
    const leftCount = Array.isArray(left.tags) ? left.tags.length : 0;
    if (rightCount !== leftCount) {
      return rightCount - leftCount;
    }

    return toMediaTimestamp(right) - toMediaTimestamp(left);
  })[0];

  return normalizeTagsForInput(candidate?.tags ?? []).join(', ');
}

export function AssignToShowDialog({
  token,
  selectedItems,
  onClose,
  onAssigned,
}: AssignToShowDialogProps) {
  const suggestedTitle = useMemo(() => {
    const showTitle = selectedItems.find((item) => item.type === 'show')?.title;
    return showTitle ?? selectedItems[0]?.title ?? '';
  }, [selectedItems]);
  const initialTagsInput = useMemo(
    () => initialTagsInputFromSelection(selectedItems),
    [selectedItems],
  );

  const [title, setTitle] = useState(suggestedTitle);
  const [seasonNumber, setSeasonNumber] = useState('1');
  const [startEpisodeNumber, setStartEpisodeNumber] = useState('1');
  const [order, setOrder] = useState<EpisodeOrder>('detect-from-filename');
  const [releaseYear, setReleaseYear] = useState('');
  const [tagsInput, setTagsInput] = useState(initialTagsInput);
  const [tagsDirty, setTagsDirty] = useState(false);
  const [candidatePosterUrl, setCandidatePosterUrl] = useState<string | null>(null);
  const [candidateBackdropUrl, setCandidateBackdropUrl] = useState<string | null>(null);
  const [candidateRemoteSource, setCandidateRemoteSource] = useState<'tmdb' | 'jikan' | null>(null);
  const [candidateRemoteSourceId, setCandidateRemoteSourceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !saving) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, saving]);

  useEffect(() => {
    setTagsInput(initialTagsInput);
    setTagsDirty(false);
    setCandidatePosterUrl(null);
    setCandidateBackdropUrl(null);
  }, [initialTagsInput]);

  const parsedSeason = Number.parseInt(seasonNumber, 10);
  const safeSeason = Number.isFinite(parsedSeason) && parsedSeason >= 0 ? parsedSeason : 1;
  const parsedStart = Number.parseInt(startEpisodeNumber, 10);
  const safeStart =
    Number.isFinite(parsedStart) && parsedStart > 0 ? parsedStart : 1;
  const parsedYear = Number.parseInt(releaseYear, 10);
  const safeYear = Number.isFinite(parsedYear) ? parsedYear : null;

  const rows = useMemo(
    () => buildAssignmentRows(selectedItems, order, safeSeason, safeStart),
    [selectedItems, order, safeSeason, safeStart],
  );

  // Per-row manual overrides: sparse map keyed by item id.
  const [overrides, setOverrides] = useState<Record<string, { season: string; episode: string }>>({});

  // Computed rows with overrides applied on top.
  const effectiveRows = useMemo(
    () =>
      rows.map((row) => {
        const override = overrides[row.item.id];
        if (!override) return row;
        const season = Number.parseInt(override.season, 10);
        const episode = Number.parseInt(override.episode, 10);
        return {
          ...row,
          seasonNumber: Number.isFinite(season) && season >= 0 ? season : row.seasonNumber,
          episodeNumber: Number.isFinite(episode) && episode >= 0 ? episode : row.episodeNumber,
        };
      }),
    [rows, overrides],
  );

  function handleRowOverride(
    itemId: string,
    field: 'season' | 'episode',
    value: string,
  ) {
    setOverrides((prev) => {
      const existing = prev[itemId];
      const baseRow = rows.find((r) => r.item.id === itemId);
      return {
        ...prev,
        [itemId]: {
          season: existing?.season ?? String(baseRow?.seasonNumber ?? 0),
          episode: existing?.episode ?? String(baseRow?.episodeNumber ?? 1),
          [field]: value,
        },
      };
    });
  }

  const detectionCount = effectiveRows.filter((row) => row.detected).length;
  const singleSeason = rowsShareSeason(effectiveRows);

  const suggestions = useMetadataSuggestions({
    token,
    title,
    type: 'show',
    year: safeYear,
  });

  function applyCandidate(candidate: MetadataSearchCandidate) {
    setTitle(candidate.title);
    if (candidate.releaseYear) {
      setReleaseYear(String(candidate.releaseYear));
    }
    if (candidate.tags.length > 0 && tagsInput.trim().length === 0) {
      setTagsInput(candidate.tags.join(', '));
      setTagsDirty(true);
    }
    setCandidatePosterUrl(candidate.posterUrl ?? null);
    setCandidateBackdropUrl(candidate.backdropUrl ?? null);
    setCandidateRemoteSource(candidate.remoteSource);
    setCandidateRemoteSourceId(candidate.remoteSourceId);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedItems.length === 0) return;

    const cleanedTitle = title.trim();
    if (!cleanedTitle) {
      setError('Title is required.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const tags = tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      const shouldApplyTags = tagsDirty;

      const hasOverrides = Object.keys(overrides).length > 0;
      const hasArtworkOverride = Boolean(candidatePosterUrl || candidateBackdropUrl);
      if (singleSeason && !hasOverrides && !hasArtworkOverride) {
        // Fast path: identical season across all rows lets us use the
        // dedicated bulk endpoint instead of N PATCH calls.
        await bulkAssignEpisodes(token, {
          mediaIds: effectiveRows.map((row) => row.item.id),
          title: cleanedTitle,
          type: 'show',
          seasonNumber: effectiveRows[0]?.seasonNumber ?? safeSeason,
          startEpisodeNumber: effectiveRows[0]?.episodeNumber ?? safeStart,
          episodeOrder: 'as-provided',
          tags: shouldApplyTags ? tags : undefined,
          releaseYear: safeYear ?? undefined,
        });
        onAssigned(effectiveRows.length);
        return;
      }

      // Mixed seasons or per-row overrides: fan out per-item PATCH calls
      // with a small concurrency limit so we don't hammer the server.
      const concurrency = 6;
      const queue = [...effectiveRows];
      let updated = 0;
      const workers = Array.from(
        { length: Math.min(concurrency, queue.length) },
        async () => {
          while (queue.length > 0) {
            const row = queue.shift();
            if (!row) return;
            const patch: MediaMetadataPatch = {
              title: cleanedTitle,
              type: 'show',
              seasonNumber: row.seasonNumber,
              episodeNumber: row.episodeNumber,
            };

            if (safeYear !== null) {
              patch.releaseYear = safeYear;
            }

            if (shouldApplyTags) {
              patch.tags = tags;
            }

            if (candidatePosterUrl) {
              patch.posterUrl = candidatePosterUrl;
            }

            if (candidateBackdropUrl) {
              patch.backdropUrl = candidateBackdropUrl;
            }

            if (candidateRemoteSource && candidateRemoteSourceId) {
              patch.remoteSource = candidateRemoteSource;
              patch.remoteSourceId = candidateRemoteSourceId;
            }

            await updateMediaMetadata(token, row.item.id, patch);
            updated += 1;
          }
        },
      );
      await Promise.all(workers);
      onAssigned(updated);
    } catch (saveError) {
      setError(toApiErrorMessage(saveError, 'Failed to assign episodes.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="metadata-modal-backdrop"
      role="presentation"
      onClick={() => !saving && onClose()}
    >
      <div
        className="metadata-modal metadata-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="metadata-modal-header">
          <div>
            <p className="metadata-modal-eyebrow">Assign to Series</p>
            <h2 id="assign-modal-title">
              {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'} selected
            </h2>
            <p className="metadata-modal-path">
              {order === 'detect-from-filename'
                ? `Detected ${detectionCount} of ${rows.length} files from filenames; unmatched files numbered sequentially.`
                : `Numbered starting at S${String(safeSeason).padStart(2, '0')}E${String(safeStart).padStart(2, '0')}.`}
            </p>
          </div>
          <button
            type="button"
            className="metadata-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="Close dialog"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M6 6 L18 18 M18 6 L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <form className="metadata-form" onSubmit={handleSubmit}>
          <div className="metadata-grid">
            <label className="metadata-field metadata-field-wide">
              <span>Show Title</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                autoFocus
              />
              <MetadataSuggestionList
                candidates={suggestions.candidates}
                loading={suggestions.loading}
                error={suggestions.error}
                onPick={applyCandidate}
              />
            </label>

            <label className="metadata-field">
              <span>Default Season</span>
              <input
                type="number"
                inputMode="numeric"
                value={seasonNumber}
                onChange={(event) => setSeasonNumber(event.target.value)}
                min={0}
              />
              <span className="metadata-field-hint">
                Used when detection can&apos;t find a season.
              </span>
            </label>

            <label className="metadata-field">
              <span>Starting Episode #</span>
              <input
                type="number"
                inputMode="numeric"
                value={startEpisodeNumber}
                onChange={(event) => setStartEpisodeNumber(event.target.value)}
                min={1}
              />
            </label>

            <label className="metadata-field">
              <span>Release Year</span>
              <input
                type="number"
                inputMode="numeric"
                value={releaseYear}
                onChange={(event) => setReleaseYear(event.target.value)}
                min={0}
                max={9999}
                placeholder="Optional"
              />
            </label>

            <label className="metadata-field metadata-field-wide">
              <span>Tags (comma separated)</span>
              <input
                type="text"
                value={tagsInput}
                onChange={(event) => {
                  setTagsInput(event.target.value);
                  setTagsDirty(true);
                }}
                placeholder="anime, drama"
              />
            </label>

            <label className="metadata-field metadata-field-wide">
              <span>Episode Order</span>
              <select value={order} onChange={(event) => setOrder(event.target.value as EpisodeOrder)}>
                <option value="detect-from-filename">
                  Detect from filename (recommended)
                </option>
                <option value="filename-asc">Sort by filename (natural)</option>
                <option value="existing-episode">Use existing season/episode</option>
                <option value="as-provided">Selection order</option>
              </select>
            </label>
          </div>

          <div className="metadata-preview">
            <p className="metadata-preview-label">
              Assignment Preview
              {order === 'detect-from-filename' ? (
                <span className="metadata-preview-hint">
                  {' '}
                  · {detectionCount} detected / {rows.length - detectionCount} sequential
                </span>
              ) : null}
            </p>
            <ol className="metadata-preview-list">
              {effectiveRows.map((row) => (
                <li key={row.item.id} className="metadata-preview-row">
                  <span
                    className={
                      overrides[row.item.id]
                        ? 'metadata-row-indicator is-edited'
                        : row.detected
                        ? 'metadata-row-indicator is-detected'
                        : 'metadata-row-indicator'
                    }
                    title={
                      overrides[row.item.id]
                        ? 'Manually edited'
                        : row.detected
                        ? 'Detected from filename'
                        : 'Sequential fallback'
                    }
                  />
                  <span className="metadata-row-se">
                    <span className="metadata-row-prefix">S</span>
                    <input
                      type="number"
                      className={`metadata-row-input${overrides[row.item.id] ? ' is-overridden' : ''}`}
                      value={overrides[row.item.id]?.season ?? String(row.seasonNumber)}
                      onChange={(e) => handleRowOverride(row.item.id, 'season', e.target.value)}
                      min={0}
                      aria-label={`Season for ${row.item.relativePath}`}
                    />
                    <span className="metadata-row-prefix">E</span>
                    <input
                      type="number"
                      className={`metadata-row-input${overrides[row.item.id] ? ' is-overridden' : ''}`}
                      value={overrides[row.item.id]?.episode ?? String(row.episodeNumber)}
                      onChange={(e) => handleRowOverride(row.item.id, 'episode', e.target.value)}
                      min={0}
                      aria-label={`Episode for ${row.item.relativePath}`}
                    />
                  </span>
                  <span className="metadata-preview-path" title={row.item.relativePath}>
                    {row.item.relativePath}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {error ? <p className="metadata-modal-error">{error}</p> : null}

          <footer className="metadata-modal-footer">
            <button
              type="button"
              className="ghost-button"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="accent-button" disabled={saving}>
              {saving ? 'Assigning…' : `Assign ${selectedItems.length} Episodes`}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
