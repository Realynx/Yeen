import type {
  MediaItem,
  NyaaSortDirection,
  NyaaSortField,
} from '../../shared/services/types';
import type { IptorrentsFlowState } from './useIptorrentsFlow';
import type { NyaaFlowState } from './useNyaaFlow';
import {
  type AutoTorrentMode,
  NYAA_DEFAULT_DIRECTION,
  NYAA_DEFAULT_SORT,
  type TorrentTrackerId,
} from './torrentSearchTypes';

export interface UseMediaDetailsTorrentSearchArgs {
  token: string;
  mediaId: string;
  current: MediaItem | null;
  hasTorrentAccess: boolean;
  iptorrents: Pick<
    IptorrentsFlowState,
    | 'searchResponse'
    | 'searchLoading'
    | 'searchRequested'
    | 'searchError'
    | 'pendingAction'
    | 'actionSuccess'
    | 'actionError'
    | 'requestSearch'
    | 'handleStartStream'
    | 'handleStartDownload'
  >;
  nyaa: Pick<
    NyaaFlowState,
    | 'searchResponse'
    | 'searchLoading'
    | 'searchRequested'
    | 'searchError'
    | 'pendingAction'
    | 'actionSuccess'
    | 'actionError'
    | 'requestSearch'
    | 'handleStartStream'
    | 'handleStartDownload'
  >;
}

export interface BestSeededTorrentResult {
  item: NonNullable<IptorrentsFlowState['searchResponse']>['results'][number] | null;
  cached: boolean;
}

export interface TorrentSearchLocalState {
  mediaId: string;
  nyaaSortBy: NyaaSortField;
  nyaaSortDirection: NyaaSortDirection;
  nyaaPage: number;
  autoTorrentPendingMode: AutoTorrentMode | null;
  autoTorrentStatus: string | null;
  autoTorrentError: string | null;
}

export function createInitialLocalState(mediaId: string): TorrentSearchLocalState {
  return {
    mediaId,
    nyaaSortBy: NYAA_DEFAULT_SORT,
    nyaaSortDirection: NYAA_DEFAULT_DIRECTION,
    nyaaPage: 1,
    autoTorrentPendingMode: null,
    autoTorrentStatus: null,
    autoTorrentError: null,
  };
}

export interface MediaDetailsTorrentSearchState {
  showPopover: boolean;
  activeTracker: TorrentTrackerId;
  preferredAutoTrackerLabel: string;
  autoTorrentPendingMode: AutoTorrentMode | null;
  heroAutoTorrentBusy: boolean;
  heroAutoTorrentStatus: string | null;
  heroAutoTorrentError: string | null;
  trackerDescription: string;
  showIptTrackerPanel: boolean;
  iptorrentsSearchUrl: string;
  nyaaSearchUrl: string;
  nyaaSortBy: NyaaSortField;
  nyaaSortDirection: NyaaSortDirection;
  resolvedNyaaPage: number;
  nyaaHasMore: boolean;
  openPopover: () => void;
  closePopover: () => void;
  setActiveTracker: (tracker: TorrentTrackerId) => void;
  selectNyaaSort: (sortBy: NyaaSortField) => void;
  toggleNyaaSortDirection: () => void;
  refreshNyaaSearch: () => void;
  goToPreviousNyaaPage: () => void;
  goToNextNyaaPage: () => void;
  retryIptSearch: () => void;
  retryNyaaSearch: () => void;
  startAutoBestSeededTorrent: (mode: AutoTorrentMode) => Promise<void>;
}
