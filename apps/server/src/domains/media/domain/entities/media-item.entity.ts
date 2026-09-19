import type {
  DigitalMediaType,
  MediaLibraryType,
  MusicMetadata,
} from '@yeen/shared-contracts';

export type {
  DigitalMediaType,
  MediaLibraryType,
  MusicMetadata,
} from '@yeen/shared-contracts';

export interface MediaSubtitleDetail {
  kind: 'embedded' | 'external';
  label: string;
  language: string | null;
  source: string;
}

export interface MediaDetails {
  formatName: string | null;
  bitRate: number | null;
  frameRate: number | null;
  audioChannels: number | null;
}

export interface MediaChapterThumbnail {
  imagePath: string;
  second: number;
  name?: string | null;
}

export interface SeriesAssignmentKeywordRule {
  keyword: string;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}

export interface SeriesAssignmentPatternRule {
  pattern: string;
  flags?: string;
  seasonGroup?: number | null;
  episodeGroup?: number | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
}

export interface SeriesAssignmentRules {
  keywordMappings?: SeriesAssignmentKeywordRule[];
  patternMappings?: SeriesAssignmentPatternRule[];
}

export interface MediaItem {
  id: string;
  title: string;
  normalizedTitle: string;
  tags: string[];
  description: string | null;
  releaseYear: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  dedupeKey: string;
  relativePath: string;
  filePath: string;
  extension: string;
  container: string | null;
  type: 'movie' | 'show' | 'other';
  digitalMediaType: DigitalMediaType;
  libraryType: MediaLibraryType;
  musicMetadata: MusicMetadata | null;
  sizeBytes: number;
  durationSeconds: number;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  subtitleStreams: number;
  subtitleDetails: MediaSubtitleDetail[];
  previewImagePath: string | null;
  backdropImagePath: string | null;
  chapterThumbnails: MediaChapterThumbnail[];
  mediaDetails: MediaDetails;
  metadataRefreshedAt: string;
  updatedAt: string;
  isRemote?: boolean;
  remoteSource?: 'tmdb' | 'jikan';
  remoteSourceId?: string | null;
  remoteSourceLabel?: string | null;
  episodeCatalogSource?: 'tmdb' | 'jikan' | null;
  episodeCatalogSourceId?: string | null;
  seriesAssignmentRules?: SeriesAssignmentRules | null;
}
