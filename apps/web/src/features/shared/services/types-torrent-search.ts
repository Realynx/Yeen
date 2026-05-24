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
