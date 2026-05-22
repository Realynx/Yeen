import type { MediaItem } from '../../lib/types';
import type { ExploreTypeFilter } from './exploreCatalog';

const GRID_GAP_PX = 13;
const GRID_MIN_TILE_WIDTH_PX = 180;
const VIRTUAL_OVERSCAN_ROWS = 3;

export interface ExploreTypeCounts {
  all: number;
  movie: number;
  show: number;
}

export interface ExploreVirtualizedRange {
  visibleItems: MediaItem[];
  topSpacerHeight: number;
  bottomSpacerHeight: number;
}

export interface ExploreVirtualizationArgs {
  filteredItems: MediaItem[];
  useCompactResultsGrid: boolean;
  viewportWidth: number;
  viewportHeight: number;
  scrollTop: number;
}

export function getExploreTypeCounts(items: MediaItem[]): ExploreTypeCounts {
  let movie = 0;
  let show = 0;

  for (const item of items) {
    if (item.type === 'movie') {
      movie += 1;
    } else if (item.type === 'show') {
      show += 1;
    }
  }

  return {
    all: items.length,
    movie,
    show,
  };
}

export function getFilteredExploreItems(
  items: MediaItem[],
  typeFilter: ExploreTypeFilter,
): MediaItem[] {
  if (typeFilter === 'all') {
    return items;
  }

  return items.filter((item) => item.type === typeFilter);
}

export function shouldUseCompactExploreGrid(items: MediaItem[]): boolean {
  return items.length > 0 && items.length < 6;
}

export function getExploreVirtualizedRange({
  filteredItems,
  useCompactResultsGrid,
  viewportWidth,
  viewportHeight,
  scrollTop,
}: ExploreVirtualizationArgs): ExploreVirtualizedRange {
  if (filteredItems.length === 0 || useCompactResultsGrid) {
    return {
      visibleItems: filteredItems,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    };
  }

  const usableWidth = Math.max(viewportWidth, GRID_MIN_TILE_WIDTH_PX);
  const columnCount = Math.max(
    1,
    Math.floor((usableWidth + GRID_GAP_PX) / (GRID_MIN_TILE_WIDTH_PX + GRID_GAP_PX)),
  );
  const totalRows = Math.ceil(filteredItems.length / columnCount);
  const gapsWidth = Math.max(0, (columnCount - 1) * GRID_GAP_PX);
  const tileWidth = Math.max(
    GRID_MIN_TILE_WIDTH_PX,
    (usableWidth - gapsWidth) / columnCount,
  );
  const rowHeight = Math.max(220, Math.round((tileWidth * 3) / 2) + GRID_GAP_PX);

  if (viewportHeight <= 0) {
    return {
      visibleItems: filteredItems,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
    };
  }

  const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - VIRTUAL_OVERSCAN_ROWS);
  const endRow = Math.min(
    totalRows - 1,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + VIRTUAL_OVERSCAN_ROWS,
  );

  const startIndex = startRow * columnCount;
  const endIndex = Math.min(filteredItems.length, (endRow + 1) * columnCount);

  return {
    visibleItems: filteredItems.slice(startIndex, endIndex),
    topSpacerHeight: startRow * rowHeight,
    bottomSpacerHeight: Math.max(0, (totalRows - endRow - 1) * rowHeight),
  };
}
