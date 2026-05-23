export type TorrentBadgeKind =
  | 'group'
  | 'resolution'
  | 'source'
  | 'video'
  | 'audio'
  | 'language'
  | 'format'
  | 'release'
  | 'misc';

export interface TorrentNameBadge {
  label: string;
  kind: TorrentBadgeKind;
}

export type TorrentReleaseKind =
  | 'episode'
  | 'range'
  | 'pack'
  | 'movie'
  | 'special'
  | 'unknown';

export interface TorrentReleaseMarker {
  kind: TorrentReleaseKind;
  season: number | null;
  episode: number | null;
  episodeEnd: number | null;
  label: string | null;
}

export interface NormalizedTorrentTitle {
  rawTitle: string;
  baseTitle: string;
  displayTitle: string;
  badges: TorrentNameBadge[];
  unknownTags: string[];
  release: TorrentReleaseMarker;
  aggregationKey: string;
  episodeSortKey: number | null;
}
