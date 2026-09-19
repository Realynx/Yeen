export type {
  AdminManagedAccount,
  AuthResponse,
  BroadcastPlaybackUpdate,
  BroadcastSourceUpdate,
  BroadcastViewerHeartbeatResponse,
  BroadcastViewerStatus,
  BroadcastOwnerSessionStatus as BroadcastOwnerSession,
  BroadcastPublicSessionStatus as BroadcastPublicSession,
  CreatedInvite,
  InviteStatus,
  TvPairingClaimRequest,
  TvPairingClaimResponse,
  TvPairingPollRequest,
  TvPairingPollResponse,
  TvPairingStartRequest,
  TvPairingStartResponse,
  TvPairingStatus,
  User,
  UserRole,
} from "@yeen/shared-contracts";
import type {
  DigitalMediaType,
  MediaLibraryLocation,
  MediaLibraryType,
  MusicMetadata,
} from "@yeen/shared-contracts";
export type {
  DigitalMediaType,
  MediaLibraryLocation,
  MediaLibraryType,
  MusicMetadata,
} from "@yeen/shared-contracts";
export type {
  AdminAccountActivityItem,
  AdminAccountMediaActivityItem,
  AdminAccountsActivityOverview,
  AdminDownloadActivityItem,
} from "./types-admin-activity";
export type { MediaScanProgress, SystemSettings } from "./types-settings";
export type { CoreUpdateStatus, CoreUpdatePhase } from "./types-updates";

export interface MediaSubtitleDetail {
  kind: "embedded" | "external";
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
  type: "movie" | "show" | "other";
  digitalMediaType: DigitalMediaType;
  libraryType?: MediaLibraryType;
  musicMetadata?: MusicMetadata | null;
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
  remoteSource?: "tmdb" | "jikan";
  remoteSourceId?: string | null;
  remoteSourceLabel?: string | null;
  episodeCatalogSource?: "tmdb" | "jikan" | null;
  episodeCatalogSourceId?: string | null;
  seriesAssignmentRules?: SeriesAssignmentRules | null;
}

export interface PlaybackPlan {
  mediaId: string;
  title: string;
  directPlay: {
    supported: boolean;
    url: string;
  };
  hls: {
    startUrl: string;
  };
  subtitles: {
    listUrl: string;
  };
  /** Optional host-neutral fields contributed by installed playback adapters. */
  [key: string]: unknown;
}

export interface PlaybackAudioTrack {
  streamIndex: number;
  label: string;
  language: string | null;
  codec: string | null;
  channels: number | null;
  isDefault: boolean;
}

export interface HlsStartResponse {
  sessionId: string;
  manifestUrl: string;
  totalDurationSeconds: number;
  selectedAudioStreamIndex: number | null;
  maxVideoBitrateKbps: number;
  audioBitrateKbps: number;
  maxOutputHeight: number;
}

export interface HlsSessionStats {
  sessionId: string;
  mediaId: string;
  startedAt: string;
  ffmpegPath: string;
  videoEncoder: "cpu" | "nvidia";
  sourceFilePath: string;
  segmentSeconds: number;
  totalDurationSeconds: number;
  totalSegments: number;
  selectedAudioStreamIndex: number | null;
  maxVideoBitrateKbps: number;
  audioBitrateKbps: number;
  maxOutputHeight: number;
  keyFrameInterval: number;
  readySegments: number;
  contiguousReadySegments: number;
  readyThroughSeconds: number;
  readyPercent: number;
  highestReadySegment: number | null;
  inflightSegments: number[];
  inflightCount: number;
  nextSegmentIndex: number | null;
  recoverableStartFailures: number;
}

export interface SubtitleTrack {
  id: string;
  kind: "embedded" | "external";
  label: string;
  language: string | null;
  format: string;
  extractable: boolean;
  streamIndex?: number;
  url: string | null;
}

export interface ProgressEntry {
  accountId?: string;
  userId?: string;
  mediaId: string;
  positionSeconds: number;
  durationSeconds: number;
  syncTimestampMs?: number | null;
  completed: boolean;
  seriesPreferenceKey?: string | null;
  preferredAudioLanguage?: string | null;
  preferredSubtitleLanguage?: string | null;
  subtitlePreferenceEnabled?: boolean | null;
  updatedAt: string;
}

export interface MediaLocationsResponse {
  locations: string[];
  libraryLocations: MediaLibraryLocation[];
  source: "settings" | "env";
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

export interface MediaStats {
  indexedItems: number;
}

export interface ApiCacheClearResult {
  persistedEntriesCleared: number;
  inMemoryEntriesCleared: number;
  message: string;
}

export interface SeriesEpisodeTrackerMissingEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
}

export type SeriesEpisodeTrackerResult =
  | {
      status: "unavailable";
      reason: string;
      source: null;
    }
  | {
      status: "ready";
      source: "jikan" | "tmdb";
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

export interface RemoteSeriesEpisode {
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  synopsis: string | null;
  airedAt: string | null;
}

export interface RemoteSeriesSeason {
  seasonNumber: number;
  episodes: RemoteSeriesEpisode[];
}

export type RemoteSeriesEpisodeCatalogResult =
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
      totalEpisodeCount: number;
      seasons: RemoteSeriesSeason[];
      updatedAt: string;
    };

export interface MediaMetadataClearResult {
  removedEntries: number;
  message: string;
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

export interface RecycleDeletionsListResponse {
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

export type MetadataImportMode = "replace" | "upsert";

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

export * from "./types-addons";
