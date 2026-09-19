import { useEffect } from 'react';
import { AddonMediaItemActions } from '../../../addons/runtime/AddonHostSlots';
import type {
  MediaItem,
  RemoteSeriesEpisode,
  RemoteSeriesEpisodeCatalogResult,
} from '../../../shared/services/types';
import { buildRemoteEpisodeMediaItem } from '../../services/remoteSeriesEpisodes';

interface RemoteSeriesEpisodesSectionProps {
  current: MediaItem;
  catalog: RemoteSeriesEpisodeCatalogResult | null;
  loading: boolean;
  error: string | null;
  activeSeason: number | null;
  focusedEpisode: number | null;
  onSelectSeason: (seasonNumber: number) => void;
  onSelectEpisode: (seasonNumber: number, episodeNumber: number) => void;
}

function episodeElementId(seasonNumber: number, episodeNumber: number) {
  return `remote-episode-s${seasonNumber}-e${episodeNumber}`;
}

function RemoteEpisodeCard(props: {
  current: MediaItem;
  catalog: Extract<RemoteSeriesEpisodeCatalogResult, { status: 'ready' }>;
  episode: RemoteSeriesEpisode;
  focused: boolean;
  onSelect: () => void;
}) {
  const addonMediaItem = buildRemoteEpisodeMediaItem(
    props.current,
    props.catalog,
    props.episode,
  );
  return (
    <article
      id={episodeElementId(
        props.episode.seasonNumber,
        props.episode.episodeNumber,
      )}
      className={`episode-card remote-episode-card${props.focused ? ' is-focused' : ''}`}
      aria-current={props.focused ? 'true' : undefined}
      tabIndex={-1}
    >
      <div className="episode-card-thumb" aria-hidden="true">
        <span className="episode-thumb-fallback">
          {String(props.episode.episodeNumber).padStart(2, '0')}
        </span>
      </div>
      <div className="episode-info">
        <div className="episode-info-header">
          <p className="episode-code">
            S{String(props.episode.seasonNumber).padStart(2, '0')}E
            {String(props.episode.episodeNumber).padStart(2, '0')}
          </p>
          {props.episode.airedAt ? (
            <span className="remote-episode-air-date">
              {props.episode.airedAt}
            </span>
          ) : null}
        </div>
        <h4 className="episode-title">{props.episode.title}</h4>
        {props.episode.synopsis ? (
          <p className="episode-description">{props.episode.synopsis}</p>
        ) : null}
        <div className="remote-episode-footer">
          <button
            type="button"
            className="remote-episode-select-button"
            aria-label={`Select S${String(props.episode.seasonNumber).padStart(2, '0')}E${String(props.episode.episodeNumber).padStart(2, '0')}: ${props.episode.title}`}
            onClick={props.onSelect}
          >
            View episode
          </button>
          <div className="remote-episode-actions">
            <AddonMediaItemActions mediaItem={addonMediaItem} />
          </div>
        </div>
      </div>
    </article>
  );
}

export function RemoteSeriesEpisodesSection(
  props: RemoteSeriesEpisodesSectionProps,
) {
  const readyCatalog =
    props.catalog?.status === 'ready' ? props.catalog : null;
  const seasons = readyCatalog?.seasons ?? [];
  const activeSeason =
    seasons.find((season) => season.seasonNumber === props.activeSeason) ??
    seasons[0] ??
    null;

  useEffect(() => {
    if (!activeSeason || props.focusedEpisode === null) return;
    const target = document.getElementById(
      episodeElementId(activeSeason.seasonNumber, props.focusedEpisode),
    );
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
  }, [activeSeason, props.focusedEpisode]);

  if (props.loading) {
    return (
      <section className="remote-series-episodes" aria-live="polite">
        <h3 className="section-title">Episodes</h3>
        <p className="muted">Loading seasons and episodes…</p>
      </section>
    );
  }
  if (props.error) {
    return (
      <section className="remote-series-episodes" aria-live="polite">
        <h3 className="section-title">Episodes</h3>
        <p className="error-text">{props.error}</p>
      </section>
    );
  }
  if (!readyCatalog) {
    return (
      <section className="remote-series-episodes" aria-live="polite">
        <h3 className="section-title">Episodes</h3>
        <p className="muted">
          {props.catalog?.status === 'unavailable'
            ? props.catalog.reason
            : 'No episode catalog is available for this series.'}
        </p>
      </section>
    );
  }

  return (
    <section className="remote-series-episodes" aria-label="Remote series episodes">
      <div className="section-heading-row">
        <div>
          <h3 className="section-title">Episodes</h3>
          <p className="remote-episode-catalog-source muted">
            {readyCatalog.totalEpisodeCount} episodes from {readyCatalog.sourceLabel}
          </p>
        </div>
        {seasons.length > 1 ? (
          <div className="season-tabs" role="tablist">
            {seasons.map((season) => (
              <button
                key={season.seasonNumber}
                type="button"
                role="tab"
                aria-selected={season.seasonNumber === activeSeason?.seasonNumber}
                className={`season-tab${season.seasonNumber === activeSeason?.seasonNumber ? ' is-active' : ''}`}
                onClick={() => props.onSelectSeason(season.seasonNumber)}
              >
                {season.seasonNumber === 0
                  ? 'Specials'
                  : `Season ${season.seasonNumber}`}
                <span className="season-tab-count">{season.episodes.length}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="episode-card-list">
        {activeSeason?.episodes.map((episode) => (
          <RemoteEpisodeCard
            key={`${episode.seasonNumber}:${episode.episodeNumber}`}
            current={props.current}
            catalog={readyCatalog}
            episode={episode}
            focused={props.focusedEpisode === episode.episodeNumber}
            onSelect={() =>
              props.onSelectEpisode(
                episode.seasonNumber,
                episode.episodeNumber,
              )
            }
          />
        ))}
      </div>
    </section>
  );
}
