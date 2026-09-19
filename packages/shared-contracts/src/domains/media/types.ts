export type DigitalMediaType = "video" | "audio" | "image" | "other";

/**
 * The product library a media item belongs to. This is deliberately separate
 * from its container/stream type so clients can switch experiences without
 * guessing from codecs or file extensions.
 */
export type MediaLibraryType = "video" | "music";

/** A configured filesystem root and the product library it is allowed to index. */
export interface MediaLibraryLocation {
  path: string;
  type: MediaLibraryType;
}

export type MusicArtworkKind = "embedded" | "sidecar" | "none";

export interface MusicMetadata {
  artist: string | null;
  album: string | null;
  albumArtist: string | null;
  trackNumber: number | null;
  discNumber: number | null;
  genre: string | null;
  artworkKind: MusicArtworkKind;
}

export interface MediaLibraryQuery {
  q?: string;
  tags?: string[];
  libraryType?: MediaLibraryType;
}

/** Identifiers used to join equivalent recordings across remote catalogs. */
export interface RemoteMusicExternalIds {
  theAudioDbTrackId?: string;
  theAudioDbAlbumId?: string;
  theAudioDbArtistId?: string;
  musicBrainzTrackId?: string;
  musicBrainzAlbumId?: string;
  musicBrainzArtistId?: string;
  spotifyId?: string;
  isrc?: string;
  [name: string]: string | undefined;
}

export interface RemoteMusicSource {
  provider: string;
  sourceId: string;
  url: string;
  playable: boolean;
  acquirable: boolean;
}

/** A provider-neutral recording returned by Core or an installed add-on. */
export interface RemoteMusicResult {
  id: string;
  title: string;
  artists: string[];
  album: string | null;
  durationSeconds: number | null;
  releaseYear: number | null;
  artworkUrl: string | null;
  externalIds: RemoteMusicExternalIds;
  sources: RemoteMusicSource[];
  localMediaId: string | null;
}

export interface RemoteMusicSearchResponse {
  query: string;
  page: number;
  limit: number;
  total: number;
  providers: string[];
  items: RemoteMusicResult[];
}

export interface RemoteMusicDiscoverResponse {
  country: string;
  generatedAt: string;
  providers: string[];
  items: RemoteMusicResult[];
}
