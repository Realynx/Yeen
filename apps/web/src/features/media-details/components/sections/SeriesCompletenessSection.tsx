import { useMemo, useState } from 'react';
import type { SeriesEpisodeTrackerResult } from '../../../shared/services/types';

interface SeriesCompletenessSectionProps {
  tracker: SeriesEpisodeTrackerResult | null;
  loading: boolean;
  error: string | null;
}

const MISSING_PREVIEW_BATCH_SIZE = 24;

type MissingPreviewRow =
  | {
      kind: 'season';
      seasonNumber: number;
      episodeCount: number;
    }
  | {
      kind: 'episode';
      seasonNumber: number;
      episodeNumber: number;
      title: string;
    };

export function SeriesCompletenessSection({
  tracker,
  loading,
  error,
}: SeriesCompletenessSectionProps) {
  const trackerIdentity =
    tracker && tracker.status === 'ready'
      ? `${tracker.providerId}:${tracker.updatedAt}:${tracker.missingEpisodeCount}`
      : null;

  const [missingPreviewState, setMissingPreviewState] = useState<{
    trackerIdentity: string | null;
    limit: number;
  }>({
    trackerIdentity: null,
    limit: MISSING_PREVIEW_BATCH_SIZE,
  });

  const missingPreviewLimit =
    missingPreviewState.trackerIdentity === trackerIdentity
      ? missingPreviewState.limit
      : MISSING_PREVIEW_BATCH_SIZE;

  const missingRows = useMemo<MissingPreviewRow[]>(() => {
    if (!tracker || tracker.status !== 'ready') {
      return [];
    }

    const missingSeasonSet = new Set<number>(tracker.missingSeasons);
    const missingEpisodesBySeason = new Map<
      number,
      Array<(typeof tracker.missingEpisodes)[number]>
    >();

    for (const episode of tracker.missingEpisodes) {
      const seasonEpisodes =
        missingEpisodesBySeason.get(episode.seasonNumber) ?? [];
      seasonEpisodes.push(episode);
      missingEpisodesBySeason.set(episode.seasonNumber, seasonEpisodes);
    }

    const seasonOrder = [
      ...new Set([
        ...tracker.missingEpisodes.map((episode) => episode.seasonNumber),
        ...tracker.missingSeasons,
      ]),
    ].sort((left, right) => left - right);

    const rows: MissingPreviewRow[] = [];
    for (const seasonNumber of seasonOrder) {
      const seasonEpisodes = [
        ...(missingEpisodesBySeason.get(seasonNumber) ?? []),
      ].sort((left, right) => left.episodeNumber - right.episodeNumber);

      if (missingSeasonSet.has(seasonNumber)) {
        rows.push({
          kind: 'season',
          seasonNumber,
          episodeCount: seasonEpisodes.length,
        });
        continue;
      }

      for (const episode of seasonEpisodes) {
        rows.push({
          kind: 'episode',
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          title: episode.title,
        });
      }
    }

    return rows;
  }, [tracker]);

  const missingPreview = useMemo(
    () => missingRows.slice(0, missingPreviewLimit),
    [missingRows, missingPreviewLimit],
  );

  const previewEpisodeCount = useMemo(
    () =>
      missingPreview.reduce(
        (total, row) => total + (row.kind === 'season' ? row.episodeCount : 1),
        0,
      ),
    [missingPreview],
  );

  const hiddenMissingCount =
    tracker && tracker.status === 'ready'
      ? Math.max(0, tracker.missingEpisodeCount - previewEpisodeCount)
      : 0;

  const hiddenRowCount = Math.max(0, missingRows.length - missingPreview.length);
  const nextBatchSize = Math.min(MISSING_PREVIEW_BATCH_SIZE, hiddenRowCount);

  if (loading) {
    return (
      <section className="series-tracker-panel" aria-live="polite">
        <div className="series-tracker-header">
          <h3 className="section-title">Series Completeness</h3>
          <span className="series-tracker-badge">Loading</span>
        </div>
        <p className="series-tracker-copy muted">
          Checking indexed episodes against the linked series catalog...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="series-tracker-panel" aria-live="polite">
        <div className="series-tracker-header">
          <h3 className="section-title">Series Completeness</h3>
          <span className="series-tracker-badge is-error">Unavailable</span>
        </div>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (!tracker) {
    return null;
  }

  if (tracker.status === 'unavailable') {
    return (
      <section className="series-tracker-panel" aria-live="polite">
        <div className="series-tracker-header">
          <h3 className="section-title">Series Completeness</h3>
          <span className="series-tracker-badge is-muted">Not Linked</span>
        </div>
        <p className="series-tracker-copy">{tracker.reason}</p>
      </section>
    );
  }

  return (
    <section className="series-tracker-panel" aria-live="polite">
      <div className="series-tracker-header">
        <h3 className="section-title">Series Completeness</h3>
        <span
          className={`series-tracker-badge${
            tracker.isComplete ? ' is-complete' : ' is-incomplete'
          }`}
        >
          {tracker.isComplete ? 'Complete Set' : 'Missing Episodes'}
        </span>
      </div>

      <p className="series-tracker-copy">
        Linked source: {tracker.sourceLabel} #{tracker.providerId}
      </p>

      <div className="series-tracker-progress" aria-hidden="true">
        <div style={{ width: `${tracker.completionPercent}%` }} />
      </div>

      <p className="series-tracker-progress-copy">
        {tracker.collectedEpisodeCount} of {tracker.expectedEpisodeCount} episodes indexed (
        {tracker.completionPercent}% complete)
      </p>

      {tracker.missingSeasons.length > 0 ? (
        <div className="series-tracker-chip-row" aria-label="Missing seasons">
          {tracker.missingSeasons.map((season) => (
            <span
              key={`missing-season-${season}`}
              className="series-tracker-chip is-missing-season"
            >
              Missing Season {season}
            </span>
          ))}
        </div>
      ) : null}

      {missingPreview.length > 0 ? (
        <div className="series-tracker-missing-wrap">
          <div className="series-tracker-missing-list" aria-label="Missing episodes">
            {missingPreview.map((row) =>
              row.kind === 'season' ? (
                <span
                  key={`missing-season-summary-${row.seasonNumber}`}
                  className="series-tracker-missing-row is-season-aggregate"
                >
                  <span className="series-tracker-episode-code">
                    S{String(row.seasonNumber).padStart(2, '0')}
                  </span>
                  <span className="series-tracker-episode-title">
                    Entire season missing
                    {row.episodeCount > 0
                      ? ` (${row.episodeCount} ${
                          row.episodeCount === 1 ? 'episode' : 'episodes'
                        })`
                      : ''}
                  </span>
                </span>
              ) : (
                <span
                  key={`missing-episode-${row.seasonNumber}-${row.episodeNumber}`}
                  className="series-tracker-missing-row"
                  title={row.title}
                >
                  <span className="series-tracker-episode-code">
                    S{String(row.seasonNumber).padStart(2, '0')}E
                    {String(row.episodeNumber).padStart(2, '0')}
                  </span>
                  <span className="series-tracker-episode-title">{row.title}</span>
                </span>
              ),
            )}
          </div>
          {hiddenRowCount > 0 ? (
            <button
              type="button"
              className="series-tracker-more-button"
              onClick={() => {
                setMissingPreviewState((prev) => {
                  const currentLimit =
                    prev.trackerIdentity === trackerIdentity
                      ? prev.limit
                      : MISSING_PREVIEW_BATCH_SIZE;

                  return {
                    trackerIdentity,
                    limit: currentLimit + MISSING_PREVIEW_BATCH_SIZE,
                  };
                });
              }}
            >
              Show {nextBatchSize} more
            </button>
          ) : null}
          {hiddenMissingCount > 0 ? (
            <p className="series-tracker-more muted">
              +{hiddenMissingCount} more missing episodes
            </p>
          ) : null}
        </div>
      ) : null}

      {tracker.note ? <p className="series-tracker-note">{tracker.note}</p> : null}
    </section>
  );
}
