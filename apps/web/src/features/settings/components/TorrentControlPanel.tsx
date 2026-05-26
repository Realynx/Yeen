import type { TorrentOrderMode } from '../../shared/services/types';
import { TorrentAddSection } from './torrent-control/TorrentAddSection';
import { TorrentLibrarySection } from './torrent-control/TorrentLibrarySection';
import { useTorrentControlState } from './torrent-control/useTorrentControlState';

interface TorrentControlPanelProps {
  token: string;
  defaultOrderMode: TorrentOrderMode;
}

export function TorrentControlPanel({
  token,
  defaultOrderMode,
}: TorrentControlPanelProps) {
  const {
    loading,
    refreshing,
    adding,
    isBusy,
    message,
    error,
    magnetLink,
    torrentFile,
    fileInputRef,
    fileInputKey,
    isDropTargetActive,
    searchQuery,
    searchActive,
    hasSelection,
    selectedCount,
    filteredTorrentCount,
    totalTorrentCount,
    groupCount,
    visibleHashesLength,
    allVisibleSelected,
    categorizedItems,
    hiddenCategories,
    selectedHashSet,
    expandedSections,
    togglePanelSection,
    toggleCategory,
    setSearchQuery,
    toggleVisibleSelection,
    clearSelection,
    handleStartSelected,
    handleStopSelected,
    handleRestartSelected,
    handleSequentialSelected,
    handleRandomSelected,
    handleDeleteSelected,
    toggleSelection,
    handleMagnetLinkChange,
    handleDragEnter,
    handleDragLeave,
    handleDropZoneDragOver,
    handleDropZoneDrop,
    handlePickedTorrentFile,
    handleClearFile,
    handleRefresh,
    handleAddTorrent,
  } = useTorrentControlState({ token });

  return (
    <article
      className="settings-surface settings-surface-full settings-surface-categorized"
      data-tv-focus-zone="shelf"
    >
      <header className="settings-surface-header torrent-control-title-panel">
        <div className="torrent-control-title-copy">
          <p className="settings-section-kicker">Download Control</p>
          <h2>Torrents</h2>
        </div>
        <span className="settings-pill torrent-control-title-pill">Categorized Controls</span>
      </header>

      <div className="settings-categories torrent-control-categories" data-tv-focus-lane-id="torrent-control-categories">
        <TorrentAddSection
          defaultOrderMode={defaultOrderMode}
          isOpen={expandedSections.addTorrent}
          onToggle={() => togglePanelSection('addTorrent')}
          adding={adding}
          loading={loading}
          refreshing={refreshing}
          isBusy={isBusy}
          magnetLink={magnetLink}
          torrentFile={torrentFile}
          fileInputRef={fileInputRef}
          fileInputKey={fileInputKey}
          isDropTargetActive={isDropTargetActive}
          onMagnetLinkChange={handleMagnetLinkChange}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDropZoneDragOver}
          onDrop={handleDropZoneDrop}
          onPickFile={handlePickedTorrentFile}
          onClearFile={handleClearFile}
          onRefresh={handleRefresh}
          onSubmit={handleAddTorrent}
        />

        <TorrentLibrarySection
          isOpen={expandedSections.torrentLibrary}
          onToggle={() => togglePanelSection('torrentLibrary')}
          loading={loading}
          adding={adding}
          isBusy={isBusy}
          hasSelection={hasSelection}
          searchActive={searchActive}
          searchQuery={searchQuery}
          selectedCount={selectedCount}
          filteredTorrentCount={filteredTorrentCount}
          totalTorrentCount={totalTorrentCount}
          groupCount={groupCount}
          visibleHashesLength={visibleHashesLength}
          allVisibleSelected={allVisibleSelected}
          categorizedItems={categorizedItems}
          hiddenCategories={hiddenCategories}
          selectedHashSet={selectedHashSet}
          onSearchQueryChange={setSearchQuery}
          onToggleVisibleSelection={toggleVisibleSelection}
          onClearSelection={clearSelection}
          onStartSelected={handleStartSelected}
          onStopSelected={handleStopSelected}
          onRestartSelected={handleRestartSelected}
          onSequentialSelected={handleSequentialSelected}
          onRandomSelected={handleRandomSelected}
          onDeleteSelected={() => {
            void handleDeleteSelected();
          }}
          onToggleCategory={toggleCategory}
          onToggleSelection={toggleSelection}
        />
      </div>

      {message ? <p className="scan-success">{message}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}
    </article>
  );
}
