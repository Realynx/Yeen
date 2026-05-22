import type { MediaItem } from '../../lib/types';
import {
  defaultTagForMode,
  isExploreCatalogMode,
  isExploreTypeFilter,
  type ExploreCatalogMode,
  type ExploreTypeFilter,
} from './exploreCatalog';

export interface ExploreSessionState {
  catalogMode: ExploreCatalogMode;
  tagFilter: string;
  typeFilter: ExploreTypeFilter;
  page: number;
  hasMore: boolean;
  remoteItems: MediaItem[];
  scrollTop: number;
}

const EXPLORE_SESSION_STORAGE_KEY = 'yeen.explore.session.v1';

export function readExploreSessionState(): ExploreSessionState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(EXPLORE_SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ExploreSessionState>;
    if (!isExploreCatalogMode(parsed.catalogMode)) {
      return null;
    }

    const tagFilter =
      typeof parsed.tagFilter === 'string'
        ? parsed.tagFilter.trim()
        : defaultTagForMode(parsed.catalogMode);

    return {
      catalogMode: parsed.catalogMode,
      tagFilter,
      typeFilter: isExploreTypeFilter(parsed.typeFilter) ? parsed.typeFilter : 'all',
      page:
        typeof parsed.page === 'number' && Number.isFinite(parsed.page)
          ? Math.max(1, Math.floor(parsed.page))
          : 1,
      hasMore: typeof parsed.hasMore === 'boolean' ? parsed.hasMore : true,
      remoteItems: Array.isArray(parsed.remoteItems)
        ? (parsed.remoteItems as MediaItem[])
        : [],
      scrollTop:
        typeof parsed.scrollTop === 'number' && Number.isFinite(parsed.scrollTop)
          ? Math.max(0, parsed.scrollTop)
          : 0,
    };
  } catch {
    return null;
  }
}

export function writeExploreSessionState(state: ExploreSessionState): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.setItem(EXPLORE_SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage write failures (private mode/quota limits).
  }
}
