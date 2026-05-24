import type {
  MediaItem,
  SeriesAssignmentRules,
} from '../../domain/entities/media-item.entity';

export interface BulkAssignEpisodesInput {
  mediaIds: string[];
  title: string;
  type?: 'movie' | 'show' | 'other';
  seasonNumber?: number | null;
  startEpisodeNumber?: number;
  episodeOrder?: 'filename-asc' | 'existing-episode' | 'as-provided';
  tags?: string[];
  releaseYear?: number | null;
  seriesAssignmentRules?: SeriesAssignmentRules | null;
}

export interface DeletedMediaItemResult {
  mediaId: string;
  title: string;
  success: boolean;
  deletedEntries: number;
  error?: string;
}

export interface BulkDeleteMediaResult {
  requested: number;
  deleted: number;
  failed: number;
  results: DeletedMediaItemResult[];
}

export interface MediaTorrentDownloadProgressItem {
  mediaId: string;
  hash: string;
  progressPercent: number;
  state: string;
}

export interface MediaStorageSummary {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  driveCount: number;
  unavailableDriveCount: number;
  asOf: string;
}

export interface MediaDriveStorageSnapshot {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
}

export interface PlaybackAudioTrack {
  streamIndex: number;
  label: string;
  language: string | null;
  codec: string | null;
  channels: number | null;
  isDefault: boolean;
}

export interface RecycleDeletionEntry {
  operationId: string;
  driveRoot: string;
  folderPath: string;
  createdAt: string | null;
  updatedAt: string;
  sizeBytes: number;
  fileCount: number;
}

export interface RecycleDeletionsListResult {
  rootsScanned: string[];
  totalEntries: number;
  totalSizeBytes: number;
  truncated: boolean;
  entries: RecycleDeletionEntry[];
}

export interface PurgeRecycleDeletionsResultItem {
  folderPath: string;
  success: boolean;
  reclaimedBytes: number;
  error?: string;
}

export interface PurgeRecycleDeletionsResult {
  requested: number;
  deleted: number;
  failed: number;
  reclaimedBytes: number;
  results: PurgeRecycleDeletionsResultItem[];
  message: string;
}

export interface SeriesEpisodeTrackerMissingEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}

export type SeriesEpisodeTrackerResult =
  | {
      status: 'unavailable';
      reason: string;
      source: null;
    }
  | {
      status: 'ready';
      source: 'jikan' | 'tmdb';
      sourceLabel: string;
      providerId: string;
      isComplete: boolean;
      completionPercent: number;
      expectedEpisodeCount: number;
      collectedEpisodeCount: number;
      missingEpisodeCount: number;
      primarySeasonNumber: number;
      seasonsSeen: number[];
      extraSeasons: number[];
      missingSeasons: number[];
      missingEpisodes: SeriesEpisodeTrackerMissingEpisode[];
      updatedAt: string;
      note: string | null;
    };

export type MetadataImportMode = 'replace' | 'upsert';

export interface MetadataExportImageAsset {
  mimeType: string;
  base64: string;
}

export interface MediaMetadataExportPayload {
  schemaVersion: 1 | 2;
  exportedAt: string;
  itemCount: number;
  items: MediaItem[];
  imageAssets?: Record<string, MetadataExportImageAsset>;
}

export interface MediaMetadataImportResult {
  mode: MetadataImportMode;
  receivedItems: number;
  importedItems: number;
  message: string;
}

export type RemoteMediaProvider = 'tmdb' | 'jikan';

export interface ParsedRemoteMediaId {
  provider: RemoteMediaProvider;
  mediaType: 'movie' | 'show';
  providerId: string;
}

export interface MetadataImportPathContext {
  roots: string[];
  rootByLabel: Map<string, string>;
}
