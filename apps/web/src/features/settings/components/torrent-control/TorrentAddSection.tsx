import type {
  DragEvent,
  FormEvent,
  RefObject,
} from 'react';
import type { TorrentOrderMode } from '../../../shared/services/types';
import { TorrentPanelSection } from './TorrentPanelSection';

interface TorrentAddSectionProps {
  defaultOrderMode: TorrentOrderMode;
  isOpen: boolean;
  onToggle: () => void;
  adding: boolean;
  loading: boolean;
  refreshing: boolean;
  isBusy: boolean;
  magnetLink: string;
  torrentFile: File | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  fileInputKey: number;
  isDropTargetActive: boolean;
  onMagnetLinkChange: (value: string) => void;
  onDragEnter: () => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onPickFile: (file: File | null) => void;
  onClearFile: () => void;
  onRefresh: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function TorrentAddSection({
  defaultOrderMode,
  isOpen,
  onToggle,
  adding,
  loading,
  refreshing,
  isBusy,
  magnetLink,
  torrentFile,
  fileInputRef,
  fileInputKey,
  isDropTargetActive,
  onMagnetLinkChange,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onPickFile,
  onClearFile,
  onRefresh,
  onSubmit,
}: TorrentAddSectionProps) {
  return (
    <TorrentPanelSection
      id="download-add-torrent"
      kicker="Downloads"
      title="Add Torrent"
      description="Submit a magnet link or drag and drop a .torrent file."
      badge="Intake"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <form className="system-settings-form" onSubmit={onSubmit}>
        <div className="settings-field settings-field-wide torrent-control-intake-field">
          <span className="settings-field-label">Magnet Link or Torrent File</span>

          <div
            className={`torrent-control-intake-shell${isDropTargetActive ? ' is-drop-active' : ''}`}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <input
              type="text"
              value={magnetLink}
              onChange={(event) => onMagnetLinkChange(event.target.value)}
              placeholder="Paste magnet:?xt=urn:btih:..."
            />

            <div className="torrent-control-intake-divider" aria-hidden="true">
              or
            </div>

            <div className="torrent-control-drop-zone">
              <input
                ref={fileInputRef}
                key={fileInputKey}
                type="file"
                accept=".torrent,application/x-bittorrent"
                className="torrent-control-file-input-hidden"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  onPickFile(nextFile);
                }}
              />

              <p className="torrent-control-drop-copy">
                {torrentFile
                  ? `Selected file: ${torrentFile.name}`
                  : 'Drag and drop a .torrent file here.'}
              </p>

              <div className="settings-actions-row torrent-control-drop-actions">
                <button
                  type="button"
                  className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy || adding}
                >
                  Choose File
                </button>

                {torrentFile ? (
                  <button
                    type="button"
                    className="ghost-button small torrent-control-action-button !rounded-lg !px-3 !py-1.5"
                    onClick={onClearFile}
                    disabled={isBusy || adding}
                  >
                    Clear File
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <small className="settings-field-hint">
            Use a magnet link or a torrent file. New torrents always start
            immediately on the host.
          </small>
        </div>

        <div className="system-settings-footer">
          <p className="muted">
            New torrents use your default order mode: {defaultOrderMode}.
          </p>
          <div className="settings-actions-row">
            <button
              type="button"
              className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
              onClick={onRefresh}
              disabled={loading || refreshing || adding || isBusy}
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>

            <button
              type="submit"
              className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
              disabled={adding || loading || isBusy}
            >
              {adding ? 'Adding...' : 'Add Torrent'}
            </button>
          </div>
        </div>
      </form>
    </TorrentPanelSection>
  );
}
