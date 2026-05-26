import { useRef } from 'react';
import type {
  NyaaSortDirection,
  NyaaSortField,
} from '../../shared/services/types';
import { IptorrentsResultsSection } from './sections/IptorrentsResultsSection';
import {
  NYAA_SORT_OPTIONS,
  TORRENT_TRACKERS,
  type TorrentTrackerId,
} from '../services/torrentSearchTypes';
import type { IptorrentsFlowState } from '../services/useIptorrentsFlow';
import type { NyaaFlowState } from '../services/useNyaaFlow';
import { useDialogLayer } from '../../navigation/hooks/useDialogLayer';

export interface MediaTorrentSearchPopoverProps {
  open: boolean;
  title: string;
  trackerDescription: string;
  activeTracker: TorrentTrackerId;
  hasTorrentAccess: boolean;
  iptorrentsSearchUrl: string;
  nyaaSearchUrl: string;
  nyaaSortBy: NyaaSortField;
  nyaaSortDirection: NyaaSortDirection;
  resolvedNyaaPage: number;
  nyaaHasMore: boolean;
  iptorrents: Pick<
    IptorrentsFlowState,
    | 'searchResponse'
    | 'searchLoading'
    | 'searchRequested'
    | 'searchError'
    | 'pendingAction'
    | 'actionSuccess'
    | 'actionError'
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
    | 'handleStartStream'
    | 'handleStartDownload'
  >;
  onClose: () => void;
  onChangeTracker: (tracker: TorrentTrackerId) => void;
  onSelectNyaaSort: (sortBy: NyaaSortField) => void;
  onToggleNyaaSortDirection: () => void;
  onRefreshNyaaSearch: () => void;
  onPreviousNyaaPage: () => void;
  onNextNyaaPage: () => void;
  onRetryIptSearch: () => void;
  onRetryNyaaSearch: () => void;
}

export function MediaTorrentSearchPopover({
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
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useDialogLayer({
    open,
    containerRef: dialogRef,
    onRequestClose: onClose,
    initialFocusSelector: 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  });

  if (!open) {
    return null;
  }

  const activeTrackerOption =
    TORRENT_TRACKERS.find((tracker) => tracker.id === activeTracker)
    ?? TORRENT_TRACKERS[0];
  const showIptTrackerPanel = activeTrackerOption.id === 'iptorrents';

  return (
    <div
      className="metadata-modal-backdrop ipt-popover-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="metadata-modal metadata-modal-wide ipt-popover-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="iptorrents-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="metadata-modal-header ipt-popover-header">
          <div className="ipt-popover-title-block">
            <p className="metadata-modal-eyebrow">Torrent Search</p>
            <h2 id="iptorrents-modal-title">{title}</h2>
            <p className="metadata-modal-path">
              {trackerDescription}
            </p>
            <div className="ipt-popover-meta" aria-live="polite">
              <span className="ipt-popover-meta-pill">
                {activeTrackerOption.label} selected
              </span>
              <span
                className={`ipt-popover-meta-pill${hasTorrentAccess ? ' is-enabled' : ' is-disabled'}`}
              >
                {hasTorrentAccess
                  ? 'Download actions enabled'
                  : 'Downloads require tracker account access'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="metadata-modal-close"
            aria-label="Close torrent search"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="ipt-popover-toolbar">
          <div className="ipt-tracker-tabs" role="tablist" aria-label="Torrent trackers">
            {TORRENT_TRACKERS.map((tracker) => {
              const isActive = activeTracker === tracker.id;
              return (
                <button
                  key={tracker.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`torrent-tracker-panel-${tracker.id}`}
                  className={`ipt-tracker-tab${isActive ? ' is-active' : ''}`}
                  onClick={() => onChangeTracker(tracker.id)}
                >
                  <span className="ipt-tracker-tab-label">{tracker.label}</span>
                </button>
              );
            })}
          </div>
          <p className="ipt-tracker-helper-text">
            <span className="ipt-tracker-helper-eyebrow">About this tracker</span>
            {activeTrackerOption.description}
          </p>
        </div>

        <div className="ipt-popover-content">
          {showIptTrackerPanel ? (
            <IptorrentsResultsSection
              queryTitle={title}
              trackerLabel={activeTrackerOption.label}
              panelId="torrent-tracker-panel-iptorrents"
              searchUrl={iptorrentsSearchUrl}
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
          ) : (
            <section
              id="torrent-tracker-panel-nyaa"
              className="ipt-tracker-preview-panel"
              role="tabpanel"
              aria-label="Nyaa integration preview"
            >
              <div className="nyaa-search-toolbar" role="group" aria-label="Nyaa search controls">
                <div className="nyaa-toolbar-cluster nyaa-toolbar-cluster-sort">
                  <span className="nyaa-toolbar-label">Sort results</span>
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
                    className="ipt-sort-direction"
                    onClick={onToggleNyaaSortDirection}
                  >
                    {nyaaSortDirection === 'desc' ? 'High to low' : 'Low to high'}
                  </button>
                </div>

                <div className="nyaa-toolbar-cluster nyaa-toolbar-cluster-actions">
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
                <div className="nyaa-pagination-controls" role="group" aria-label="Nyaa result pages">
                  <button
                    type="button"
                    className="ghost-button small"
                    disabled={resolvedNyaaPage <= 1}
                    onClick={onPreviousNyaaPage}
                  >
                    Previous Page
                  </button>

                  <p className="nyaa-pagination-status">
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
