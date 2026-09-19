interface ExploreAutoLoadState {
  isIntersecting: boolean;
  intersectionRatio: number;
  minimumIntersectionRatio: number;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  locked: boolean;
  tagFilter: string;
}

export function shouldAutoLoadExplorePage(
  state: ExploreAutoLoadState,
): boolean {
  return state.isIntersecting
    && state.intersectionRatio >= state.minimumIntersectionRatio
    && !state.loading
    && !state.loadingMore
    && state.hasMore
    && !state.locked
    && state.tagFilter.trim().length >= 2;
}
