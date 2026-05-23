import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeTorrentResultTitle } from '../../services/torrentTitleNormalization';
import {
  IptorrentsAggregateCard,
  IptorrentsResultCard,
} from './IptorrentsResultCards';
import { IptorrentsSortToolbar } from './IptorrentsSortToolbar';
import {
  buildAggregatedResults,
  DEFAULT_VIRTUAL_VIEWPORT_HEIGHT,
  type IptSortDirection,
  type IptSortField,
  type IptorrentsResultsSectionProps,
  sortMetricValue,
  VIRTUALIZE_MIN_RESULTS,
  VIRTUAL_OVERSCAN_ROWS,
  VIRTUAL_ROW_HEIGHT,
} from '../../services/iptorrentsShared';

export function IptorrentsResultsSection({
  queryTitle,
  trackerLabel = 'IPTorrents',
  panelId,
  searchUrl,
  showLocalControls = true,
  enableEpisodeAggregation = false,
  disableVirtualization = false,
  loading,
  hasSearchRequest = false,
  error,
  response,
  canStartDownload = false,
  pendingAction = null,
  actionMessage = null,
  actionError = null,
  onRetrySearch = null,
  onStartStream,
  onStartDownload,
}: IptorrentsResultsSectionProps) {
  const results = useMemo(() => response?.results ?? [], [response]);
  const totalMatches = response?.total ?? results.length;
  const [sortField, setSortField] = useState<IptSortField>('seeders');
  const [sortDirection, setSortDirection] = useState<IptSortDirection>('desc');
  const [nameFilter, setNameFilter] = useState('');
  const [virtualScrollState, setVirtualScrollState] = useState({
    key: '',
    scrollTop: 0,
  });
  const [virtualViewportHeight, setVirtualViewportHeight] = useState(
    DEFAULT_VIRTUAL_VIEWPORT_HEIGHT,
  );
  const virtualScrollRef = useRef<HTMLDivElement | null>(null);

  const annotatedResults = useMemo(
    () =>
      results.map((item, originalIndex) => ({
        item,
        originalIndex,
        normalizedTitle: normalizeTorrentResultTitle(item.title, queryTitle),
      })),
    [queryTitle, results],
  );

  const normalizedNameFilter = nameFilter.trim().toLowerCase();
  const hasLocalFilter = normalizedNameFilter.length > 0;

  const locallyFilteredResults = useMemo(() => {
    if (!showLocalControls || !hasLocalFilter) {
      return annotatedResults;
    }

    return annotatedResults.filter((entry) => {
      const badgeText = entry.normalizedTitle.badges
        .map((badge) => badge.label)
        .join(' ');
      const haystack = [
        entry.item.title,
        entry.item.subtitle ?? '',
        entry.item.category,
        entry.normalizedTitle.displayTitle,
        badgeText,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedNameFilter);
    });
  }, [annotatedResults, hasLocalFilter, normalizedNameFilter, showLocalControls]);

  const sortedResults = useMemo(() => {
    if (!showLocalControls) {
      return locallyFilteredResults;
    }

    return locallyFilteredResults
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => {
        const leftValue = sortMetricValue(left.entry.item, sortField);
        const rightValue = sortMetricValue(right.entry.item, sortField);

        const delta =
          sortDirection === 'desc'
            ? rightValue - leftValue
            : leftValue - rightValue;

        if (delta !== 0) {
          return delta;
        }

        return left.index - right.index;
      })
      .map((entry) => entry.entry);
  }, [locallyFilteredResults, showLocalControls, sortDirection, sortField]);

  const shouldVirtualize =
    !disableVirtualization
    && !enableEpisodeAggregation
    && sortedResults.length >= VIRTUALIZE_MIN_RESULTS;

  const virtualScrollKey = useMemo(() => {
    const first = sortedResults[0];
    const last = sortedResults[sortedResults.length - 1];
    return [
      sortField,
      sortDirection,
      showLocalControls ? '1' : '0',
      sortedResults.length,
      first ? `${first.item.id}:${first.originalIndex}` : 'none',
      last ? `${last.item.id}:${last.originalIndex}` : 'none',
    ].join(':');
  }, [showLocalControls, sortDirection, sortField, sortedResults]);

  const virtualScrollTop =
    virtualScrollState.key === virtualScrollKey
      ? virtualScrollState.scrollTop
      : 0;

  useEffect(() => {
    if (virtualScrollRef.current) {
      virtualScrollRef.current.scrollTop = 0;
    }
  }, [virtualScrollKey]);

  useEffect(() => {
    if (!shouldVirtualize) {
      return;
    }

    const container = virtualScrollRef.current;
    if (!container) {
      return;
    }

    const updateViewportHeight = () => {
      setVirtualViewportHeight(
        container.clientHeight || DEFAULT_VIRTUAL_VIEWPORT_HEIGHT,
      );
    };

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    return () => {
      window.removeEventListener('resize', updateViewportHeight);
    };
  }, [shouldVirtualize]);

  const virtualVisibleRange = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        startIndex: 0,
        endIndex: sortedResults.length,
      };
    }

    const estimatedStart = Math.floor(virtualScrollTop / VIRTUAL_ROW_HEIGHT);
    const startIndex = Math.max(0, estimatedStart - VIRTUAL_OVERSCAN_ROWS);
    const visibleRowCount = Math.ceil(virtualViewportHeight / VIRTUAL_ROW_HEIGHT);
    const endIndex = Math.min(
      sortedResults.length,
      startIndex + visibleRowCount + VIRTUAL_OVERSCAN_ROWS * 2,
    );

    return {
      startIndex,
      endIndex,
    };
  }, [shouldVirtualize, sortedResults.length, virtualScrollTop, virtualViewportHeight]);

  const visibleResults = sortedResults.slice(
    virtualVisibleRange.startIndex,
    virtualVisibleRange.endIndex,
  );

  const aggregatedVisibleResults = useMemo(() => {
    if (!enableEpisodeAggregation || shouldVirtualize) {
      return {
        entries: visibleResults.map((entry) => ({
          kind: 'item' as const,
          entry,
        })),
        groupCount: 0,
      };
    }

    return buildAggregatedResults(visibleResults);
  }, [enableEpisodeAggregation, shouldVirtualize, visibleResults]);

  const topSpacerHeight = shouldVirtualize
    ? virtualVisibleRange.startIndex * VIRTUAL_ROW_HEIGHT
    : 0;
  const bottomSpacerHeight = shouldVirtualize
    ? Math.max(
        0,
        (sortedResults.length - virtualVisibleRange.endIndex) * VIRTUAL_ROW_HEIGHT,
      )
    : 0;

  return (
    <section
      id={panelId}
      role={panelId ? 'tabpanel' : undefined}
      aria-label={panelId ? `${trackerLabel} search results` : undefined}
    >
      <div className="section-heading-row ipt-results-heading">
        <div>
          <h3 className="section-title">{trackerLabel} Results</h3>
          <p className="section-subtitle">
            Results for {queryTitle} from {trackerLabel}.
          </p>
        </div>
        <a
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ghost-button small"
        >
          Open {trackerLabel}
        </a>
      </div>

      {loading ? <p className="muted">Searching {trackerLabel}...</p> : null}

      {!loading && error ? <p className="error-text">{error}</p> : null}

      {!loading && error && onRetrySearch ? (
        <button
          type="button"
          className="ghost-button small ipt-retry-button"
          onClick={onRetrySearch}
        >
          Retry Search
        </button>
      ) : null}

      {actionMessage ? (
        <p className="muted ipt-download-feedback">{actionMessage}</p>
      ) : null}

      {actionError ? (
        <p className="error-text ipt-download-feedback">{actionError}</p>
      ) : null}

      {!loading && !error && hasSearchRequest && results.length === 0 ? (
        <p className="muted">
          No torrent matches were returned from {trackerLabel} for this title.
        </p>
      ) : null}

      {!loading && !error && results.length > 0 ? (
        <>
          {showLocalControls ? (
            <IptorrentsSortToolbar
              trackerLabel={trackerLabel}
              sortField={sortField}
              sortDirection={sortDirection}
              nameFilter={nameFilter}
              onChangeSortField={setSortField}
              onToggleSortDirection={() => {
                setSortDirection((current) =>
                  current === 'desc' ? 'asc' : 'desc',
                );
              }}
              onChangeNameFilter={setNameFilter}
            />
          ) : null}

          <p className="ipt-results-summary">
            Showing {sortedResults.length} result{sortedResults.length === 1 ? '' : 's'}
            {showLocalControls && hasLocalFilter
              ? ` matching "${nameFilter.trim()}"`
              : ''}
            {totalMatches > sortedResults.length
              ? ` of ${totalMatches} total matches`
              : ''}
            .
            {enableEpisodeAggregation && aggregatedVisibleResults.groupCount > 0
              ? ` Grouped into ${aggregatedVisibleResults.groupCount} episode bundle${
                  aggregatedVisibleResults.groupCount === 1 ? '' : 's'
                }.`
              : ''}
          </p>

          {showLocalControls && sortedResults.length === 0 ? (
            <p className="muted">No results match the local name filter.</p>
          ) : shouldVirtualize ? (
            <div
              ref={virtualScrollRef}
              className="ipt-results-virtual-scroll"
              onScroll={(event) => {
                const nextScrollTop = event.currentTarget.scrollTop;
                setVirtualScrollState((current) => {
                  const currentScrollTop =
                    current.key === virtualScrollKey ? current.scrollTop : 0;
                  const currentRow = Math.floor(currentScrollTop / VIRTUAL_ROW_HEIGHT);
                  const nextRow = Math.floor(nextScrollTop / VIRTUAL_ROW_HEIGHT);

                  if (currentRow === nextRow && current.key === virtualScrollKey) {
                    return current;
                  }

                  return {
                    key: virtualScrollKey,
                    scrollTop: nextScrollTop,
                  };
                });
              }}
            >
              <div
                className="ipt-results-virtual-spacer"
                style={{ height: `${topSpacerHeight}px` }}
                aria-hidden="true"
              />

              <div className="ipt-results-list ipt-results-list-virtualized">
                {visibleResults.map((entry) => (
                  <IptorrentsResultCard
                    key={`${entry.item.id}-${entry.originalIndex}`}
                    entry={entry}
                    canStartDownload={canStartDownload}
                    pendingAction={pendingAction}
                    onStartStream={onStartStream}
                    onStartDownload={onStartDownload}
                  />
                ))}
              </div>

              <div
                className="ipt-results-virtual-spacer"
                style={{ height: `${bottomSpacerHeight}px` }}
                aria-hidden="true"
              />
            </div>
          ) : (
            <div className="ipt-results-list">
              {aggregatedVisibleResults.entries.map((entry) =>
                entry.kind === 'item' ? (
                  <IptorrentsResultCard
                    key={`${entry.entry.item.id}-${entry.entry.originalIndex}`}
                    entry={entry.entry}
                    canStartDownload={canStartDownload}
                    pendingAction={pendingAction}
                    onStartStream={onStartStream}
                    onStartDownload={onStartDownload}
                  />
                ) : (
                  <IptorrentsAggregateCard
                    key={`aggregate-${entry.group.key}`}
                    group={entry.group}
                    canStartDownload={canStartDownload}
                    pendingAction={pendingAction}
                    onStartStream={onStartStream}
                    onStartDownload={onStartDownload}
                  />
                ),
              )}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
