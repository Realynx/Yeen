import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { IptorrentsResultsSection } from './sections/IptorrentsResultsSection';
import {
  NYAA_SORT_OPTIONS,
  TORRENT_TRACKERS,
} from '../services/torrentSearchTypes';
import type { MediaTorrentSearchPopoverProps } from './MediaTorrentSearchPopover';
import { useDialogLayer } from '../../navigation/hooks/useDialogLayer';

const SHEET_CLOSE_SWIPE_THRESHOLD = 96;
const SHEET_MAX_DRAG_OFFSET = 220;

export function MediaTorrentSearchPopoverPhone({
  open,
  title,
  trackerDescription,
  activeTracker,
  hasTorrentAccess,
  iptorrentsSearchUrl,
  nyaaSearchUrl,
  nyaaSortBy,
  nyaaSortDirection,
  resolvedNyaaPage,
  nyaaHasMore,
  iptorrents,
  nyaa,
  onClose,
  onChangeTracker,
  onSelectNyaaSort,
  onToggleNyaaSortDirection,
  onRefreshNyaaSearch,
  onPreviousNyaaPage,
  onNextNyaaPage,
  onRetryIptSearch,
  onRetryNyaaSearch,
}: MediaTorrentSearchPopoverProps) {
  const [sheetDragOffset, setSheetDragOffset] = useState(0);
  const [sheetDragActive, setSheetDragActive] = useState(false);
  const swipeStartYRef = useRef<number | null>(null);
  const swipePointerIdRef = useRef<number | null>(null);
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useDialogLayer({
    open,
    containerRef: dialogRef,
    onRequestClose: onClose,
    initialFocusSelector: 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      return;
    }

    swipeStartYRef.current = null;
    swipePointerIdRef.current = null;
    setSheetDragOffset(0);
    setSheetDragActive(false);
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open) {
    return null;
  }

  const activeTrackerOption =
    TORRENT_TRACKERS.find((tracker) => tracker.id === activeTracker)
    ?? TORRENT_TRACKERS[0];
  const showIptTrackerPanel = activeTrackerOption.id === 'iptorrents';

  const handleSheetSwipeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') {
      return;
    }

    if ((contentScrollRef.current?.scrollTop ?? 0) > 0) {
      swipeStartYRef.current = null;
      swipePointerIdRef.current = null;
      setSheetDragActive(false);
      return;
    }

    swipeStartYRef.current = event.clientY;
    swipePointerIdRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSheetDragActive(true);
  };

  const handleSheetSwipeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!sheetDragActive) {
      return;
    }

    if (swipePointerIdRef.current !== event.pointerId) {
      return;
    }

    const startY = swipeStartYRef.current;
    const currentY = event.clientY;
    if (startY === null || typeof currentY !== 'number') {
      return;
    }

    const delta = currentY - startY;
    if (delta <= 0) {
      setSheetDragOffset(0);
      return;
    }

    setSheetDragOffset(Math.min(delta, SHEET_MAX_DRAG_OFFSET));
    event.preventDefault();
  };

  const resetSheetSwipe = () => {
    swipeStartYRef.current = null;
    swipePointerIdRef.current = null;
    setSheetDragActive(false);
    setSheetDragOffset(0);
  };

  const handleSheetSwipeEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (swipePointerIdRef.current !== null && swipePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (!sheetDragActive) {
      resetSheetSwipe();
      return;
    }

    const shouldClose = sheetDragOffset >= SHEET_CLOSE_SWIPE_THRESHOLD;
    resetSheetSwipe();

    if (shouldClose) {
      onClose();
    }
  };

  return (
    <div
      className="media-torrent-phone-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className={`media-torrent-phone-sheet${sheetDragActive ? ' is-dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-torrent-search-modal-title"
        style={sheetDragOffset > 0 ? { transform: `translateY(${sheetDragOffset}px)` } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="media-torrent-phone-header">
          <div className="media-torrent-phone-header-top">
            <div
              className="media-torrent-phone-drag-zone"
              role="presentation"
              aria-hidden="true"
              onPointerDown={handleSheetSwipeStart}
              onPointerMove={handleSheetSwipeMove}
              onPointerUp={handleSheetSwipeEnd}
              onPointerCancel={handleSheetSwipeEnd}
            >
              <span className="media-torrent-phone-grabber" aria-hidden="true" />
            </div>
            <button
              type="button"
              className="media-torrent-phone-close"
              aria-label="Close torrent search"
              onClick={onClose}
            >
              Close
            </button>
          </div>

          <p className="media-torrent-phone-eyebrow">Torrent Search</p>
          <h2 id="phone-torrent-search-modal-title">{title}</h2>
          <p className="media-torrent-phone-description">{trackerDescription}</p>

          <div className="media-torrent-phone-meta" aria-live="polite">
            <span className="media-torrent-phone-pill">
              {activeTrackerOption.label} selected
            </span>
            <span
              className={`media-torrent-phone-pill${hasTorrentAccess ? ' is-enabled' : ' is-disabled'}`}
            >
              {hasTorrentAccess
                ? 'Download actions enabled'
                : 'Downloads require tracker account access'}
            </span>
          </div>

          <div
            className="media-torrent-phone-tabs"
            role="tablist"
            aria-label="Torrent trackers"
          >
            {TORRENT_TRACKERS.map((tracker) => {
              const isActive = activeTracker === tracker.id;
              return (
                <button
                  key={tracker.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`phone-torrent-tracker-panel-${tracker.id}`}
                  className={`media-torrent-phone-tab${isActive ? ' is-active' : ''}`}
                  onClick={() => onChangeTracker(tracker.id)}
                >
                  <span className="media-torrent-phone-tab-dot" aria-hidden="true" />
                  <span>{tracker.label}</span>
                </button>
              );
            })}
          </div>
        </header>

        <div ref={contentScrollRef} className="media-torrent-phone-content">
          <p className="media-torrent-phone-tracker-help">
            <span className="media-torrent-phone-tracker-help-eyebrow">About this tracker</span>
            {activeTrackerOption.description}
          </p>

          {showIptTrackerPanel ? (
            <section
              id="phone-torrent-tracker-panel-iptorrents"
              className="media-torrent-phone-panel"
              role="tabpanel"
              aria-label="IPTorrents integration"
            >
              <IptorrentsResultsSection
                queryTitle={title}
                trackerLabel={activeTrackerOption.label}
                searchUrl={iptorrentsSearchUrl}
                disableVirtualization
                loading={iptorrents.searchLoading}
                hasSearchRequest={iptorrents.searchRequested}
                error={iptorrents.searchError}
                response={iptorrents.searchResponse}
                canStartDownload={hasTorrentAccess}
                pendingAction={iptorrents.pendingAction}
                actionMessage={iptorrents.actionSuccess}
                actionError={iptorrents.actionError}
                onRetrySearch={onRetryIptSearch}
                onStartStream={iptorrents.handleStartStream}
                onStartDownload={iptorrents.handleStartDownload}
              />
            </section>
          ) : (
            <section
              id="phone-torrent-tracker-panel-nyaa"
              className="media-torrent-phone-panel"
              role="tabpanel"
              aria-label="Nyaa integration"
            >
              <div className="media-torrent-phone-nyaa-toolbar" role="group" aria-label="Nyaa search controls">
                <div className="media-torrent-phone-nyaa-sort">
                  <span className="media-torrent-phone-control-label">Sort results</span>
                  <div className="ipt-sort-options" role="group" aria-label="Nyaa sort field">
                    {NYAA_SORT_OPTIONS.map((sortOption) => (
                      <button
                        key={sortOption.value}
                        type="button"
                        className={`ipt-sort-chip${nyaaSortBy === sortOption.value ? ' is-active' : ''}`}
                        onClick={() => {
                          onSelectNyaaSort(sortOption.value);
                        }}
                      >
                        {sortOption.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="ipt-sort-direction media-torrent-phone-sort-direction"
                    onClick={onToggleNyaaSortDirection}
                  >
                    {nyaaSortDirection === 'desc' ? 'High to low' : 'Low to high'}
                  </button>
                </div>

                <div className="media-torrent-phone-nyaa-actions">
                  <button
                    type="button"
                    className="ghost-button small"
                    onClick={onRefreshNyaaSearch}
                  >
                    Refresh Nyaa Search
                  </button>
                </div>
              </div>

              <IptorrentsResultsSection
                queryTitle={title}
                trackerLabel={activeTrackerOption.label}
                searchUrl={nyaaSearchUrl}
                enableEpisodeAggregation
                disableVirtualization
                loading={nyaa.searchLoading}
                hasSearchRequest={nyaa.searchRequested}
                error={nyaa.searchError}
                response={nyaa.searchResponse}
                canStartDownload={hasTorrentAccess}
                pendingAction={nyaa.pendingAction}
                actionMessage={nyaa.actionSuccess}
                actionError={nyaa.actionError}
                onRetrySearch={onRetryNyaaSearch}
                onStartStream={nyaa.handleStartStream}
                onStartDownload={nyaa.handleStartDownload}
                showLocalControls={false}
              />

              {!nyaa.searchLoading && !nyaa.searchError && nyaa.searchRequested ? (
                <div className="media-torrent-phone-pagination" role="group" aria-label="Nyaa result pages">
                  <button
                    type="button"
                    className="ghost-button small"
                    disabled={resolvedNyaaPage <= 1}
                    onClick={onPreviousNyaaPage}
                  >
                    Previous Page
                  </button>

                  <p className="media-torrent-phone-pagination-status">
                    Page {resolvedNyaaPage}
                    {typeof nyaa.searchResponse?.total === 'number' && nyaa.searchResponse.total > 0
                      ? ` · ${nyaa.searchResponse.total} total results`
                      : ''}
                  </p>

                  <button
                    type="button"
                    className="ghost-button small"
                    disabled={!nyaaHasMore}
                    onClick={onNextNyaaPage}
                  >
                    Next Page
                  </button>
                </div>
              ) : null}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}