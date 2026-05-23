export interface User {
  id: string;
  email: string;
  name: string;
  avatarDataUrl?: string | null;
  role: 'admin' | 'sailer' | 'user';
  invitesRemaining: number | null;
  invitedByAccountId: string | null;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface InviteStatus {
  token: string;
  inviterName: string;
  createdAt: string;
}

export interface CreatedInvite {
  token: string;
  invitePath: string;
  createdAt: string;
  remainingInvites: number | null;
}

export interface AdminManagedAccount extends User {
  invitedByName: string | null;
}

export type DigitalMediaType = 'video' | 'audio' | 'image' | 'other';

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
  torrent: {
    hash: string;
    statusUrl: string;
  } | null;
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
  selectedAudioStreamIndex: number | null;
}

export interface HlsSessionStats {
  sessionId: string;
  mediaId: string;
  startedAt: string;
  ffmpegPath: string;
  sourceFilePath: string;
  segmentSeconds: number;
  totalDurationSeconds: number;
  totalSegments: number;
  keyFrameInterval: number;
  torrentHash: string | null;
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

export type TorrentOrderMode = 'sequential' | 'random';
export type TorrentIntent = 'stream' | 'background';

export interface TorrentItem {
  hash: string;
  name: string;
  state: string;
  progress: number;
  etaSeconds: number;
  downloadRate: number;
  uploadRate: number;
  sizeBytes: number;
  completedBytes: number;
  savePath: string | null;
  sequentialDownload: boolean | null;
  firstLastPiecePriority: boolean | null;
}

export interface SubtitleTrack {
  id: string;
  kind: 'embedded' | 'external';
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
  completed: boolean;
  seriesPreferenceKey?: string | null;
  preferredAudioLanguage?: string | null;
  preferredSubtitleLanguage?: string | null;
  subtitlePreferenceEnabled?: boolean | null;
  updatedAt: string;
}

export interface MediaTorrentDownloadProgressEntry {
  mediaId: string;
  hash: string;
  progressPercent: number;
  state: string;
}

export interface MediaLocationsResponse {
  locations: string[];
  source: 'settings' | 'env';
}

export interface MediaStats {
  indexedItems: number;
}

export interface ApiCacheClearResult {
  persistedEntriesCleared: number;
  inMemoryEntriesCleared: number;
  message: string;
}

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

export interface MediaScanProgress {
  scanId: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  phase: 'idle' | 'collecting' | 'probing' | 'saving' | 'completed' | 'failed';
  libraryPaths: string[];
  totalFiles: number;
  processedFiles: number;
  indexedItems: number;
  failedFiles: number;
  skippedIndexedFiles: number;
  currentFile: string | null;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  scannedAt: string | null;
}

export interface QbittorrentPathMapping {
  from: string;
  to: string;
}

export interface SystemSettings {
  ffmpegPath: string;
  ffprobePath: string;
  thumbnailCaptureCount: number;
  mediaMetadataSqlitePath: string;
  tmdbApiKey: string;
  openSubtitlesApiKey: string;
  qbittorrentBaseUrl: string;
  qbittorrentUsername: string;
  qbittorrentPassword: string;
  qbittorrentRequestTimeoutMs: number;
  qbittorrentDefaultOrderMode: 'sequential' | 'random';
  qbittorrentPathMappings: QbittorrentPathMapping[];
  iptorrentsUsername: string;
  iptorrentsPassword: string;
  iptorrentsSeedingEnabled: boolean;
  nyaaSeedingEnabled: boolean;
  transcodePreset: string;
  transcodeCrf: number;
  hlsSegmentSeconds: number;
  subtitleDefaultLanguage: string;
}

export interface IptorrentsSearchItem {
  id: string;
  title: string;
  category: string;
  subtitle: string | null;
  size: string;
  snatches: number;
  seeders: number;
  leechers: number;
  comments: number;
  isFreeleech: boolean;
  isNew: boolean;
  detailsUrl: string;
  downloadUrl: string | null;
}

export interface IptorrentsSearchResponse {
  query: string;
  mediaType: 'movie' | 'show' | 'all';
  sourceUrl: string;
  total: number;
  results: IptorrentsSearchItem[];
}

export type NyaaSortField = 'size' | 'seeders' | 'leechers';
export type NyaaSortDirection = 'desc' | 'asc';

export interface NyaaSearchResponse extends IptorrentsSearchResponse {
  category: string;
  page: number;
  hasMore: boolean;
  sortBy: NyaaSortField;
  sortDirection: NyaaSortDirection;
}
