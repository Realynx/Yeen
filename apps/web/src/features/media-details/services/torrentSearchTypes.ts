import type {
  IptorrentsSearchResponse,
  NyaaSortDirection,
  NyaaSortField,
} from '../../shared/services/types';

export type TorrentTrackerId = 'iptorrents' | 'nyaa';
export type AutoTorrentMode = 'stream' | 'download';
export type SearchResultItem = IptorrentsSearchResponse['results'][number];

export interface TorrentTrackerOption {
  id: TorrentTrackerId;
  label: string;
  description: string;
}

export const TORRENT_TRACKERS: TorrentTrackerOption[] = [
  {
    id: 'iptorrents',
    label: 'IPTorrents',
    description: 'Private tracker search with stream/download actions.',
  },
  {
    id: 'nyaa',
    label: 'Nyaa',
    description: 'Public tracker search with category filtering via HTML scraping.',
  },
];

export interface NyaaSortOption {
  value: NyaaSortField;
  label: string;
}

export const NYAA_DEFAULT_SORT: NyaaSortField = 'seeders';
export const NYAA_DEFAULT_DIRECTION: NyaaSortDirection = 'desc';

export const NYAA_SORT_OPTIONS: NyaaSortOption[] = [
  { value: 'seeders', label: 'Seeders' },
  { value: 'leechers', label: 'Leechers' },
  { value: 'size', label: 'Size' },
];
