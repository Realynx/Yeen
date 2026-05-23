import type { MediaItem } from '../../shared/services/types';
import { episodeDisplayTitle } from '../../media-details/services/mediaDetailsUtils';

export function compareEpisodeOrder(left: MediaItem, right: MediaItem): number {
  const seasonDelta = (left.seasonNumber ?? 0) - (right.seasonNumber ?? 0);
  if (seasonDelta !== 0) {
    return seasonDelta;
  }

  const episodeDelta = (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0);
  if (episodeDelta !== 0) {
    return episodeDelta;
  }

  return episodeDisplayTitle(left).localeCompare(episodeDisplayTitle(right));
}

export function episodeCode(item: MediaItem): string {
  return `S${String(item.seasonNumber ?? 0).padStart(2, '0')}E${String(item.episodeNumber ?? 0).padStart(2, '0')}`;
}
