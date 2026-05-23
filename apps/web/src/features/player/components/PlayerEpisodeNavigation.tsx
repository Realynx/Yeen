import type { CSSProperties } from 'react';
import type { MediaItem } from '../../shared/services/types';
import { episodeDisplayTitle } from '../../media-details/services/mediaDetailsUtils';
import { episodeCode } from '../services/episodeOrdering';

interface PlayerEpisodeNavigationProps {
  isShowMedia: boolean;
  previousEpisode: MediaItem | null;
  nextEpisode: MediaItem | null;
  previousEpisodeImage: string | null;
  nextEpisodeImage: string | null;
  onNavigateToEpisode: (episodeId: string) => void;
}

function toEpisodeBackgroundStyle(imageUrl: string | null): CSSProperties | undefined {
  if (!imageUrl) {
    return undefined;
  }

  return { ['--player-episode-bg' as string]: `url("${imageUrl}")` };
}

export function PlayerEpisodeNavigation({
  isShowMedia,
  previousEpisode,
  nextEpisode,
  previousEpisodeImage,
  nextEpisodeImage,
  onNavigateToEpisode,
}: PlayerEpisodeNavigationProps) {
  if (!isShowMedia || (!previousEpisode && !nextEpisode)) {
    return null;
  }

  return (
    <section
      className={`player-episode-nav${previousEpisode && nextEpisode ? '' : ' is-single'}`}
      aria-label="Episode navigation"
    >
      {previousEpisode ? (
        <button
          type="button"
          className="player-episode-link"
          onClick={() => onNavigateToEpisode(previousEpisode.id)}
          style={toEpisodeBackgroundStyle(previousEpisodeImage)}
        >
          <span className="player-episode-link-kicker">Previous Episode</span>
          <span className="player-episode-link-code">{episodeCode(previousEpisode)}</span>
          <strong className="player-episode-link-title">{episodeDisplayTitle(previousEpisode)}</strong>
        </button>
      ) : null}

      {nextEpisode ? (
        <button
          type="button"
          className="player-episode-link is-next"
          onClick={() => onNavigateToEpisode(nextEpisode.id)}
          style={toEpisodeBackgroundStyle(nextEpisodeImage)}
        >
          <span className="player-episode-link-kicker">Next Episode</span>
          <span className="player-episode-link-code">{episodeCode(nextEpisode)}</span>
          <strong className="player-episode-link-title">{episodeDisplayTitle(nextEpisode)}</strong>
        </button>
      ) : null}
    </section>
  );
}
