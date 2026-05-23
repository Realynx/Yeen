import type { SeriesAssignmentRules } from '../../../domain/entities/media-item.entity';

export interface MediaMetadataPatch {
  title?: string;
  description?: string | null;
  releaseYear?: number | null;
  type?: 'movie' | 'show' | 'other';
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  episodeTitle?: string | null;
  tags?: string[];
  posterUrl?: string | null;
  backdropUrl?: string | null;
  remoteSource?: 'tmdb' | 'jikan' | null;
  remoteSourceId?: string | null;
  seriesAssignmentRules?: SeriesAssignmentRules | null;
}
