import type { FormEvent } from 'react';
import type { MediaLocationsState } from '../../services/useMediaLocations';
import { SettingsCategorySection } from './SettingsCategorySection';
import {
  formatScanPhase,
  formatScanStatus,
  getActiveScan,
  getScanProgressPercent,
} from '../../services/scanProgressUtils';

interface MediaLocationsCategoryProps {
  mediaLocationsState: MediaLocationsState;
  configuredLabel: string;
  isOpen: boolean;
  onToggle: () => void;
  onAddLocation: (event: FormEvent<HTMLFormElement>) => void;
  onScan: (event: FormEvent<HTMLFormElement>) => void;
}

function MediaLocationList({ state }: { state: MediaLocationsState }) {
  if (state.loadingLocations) return <p className="muted">Loading media locations...</p>;
  if (state.locations.length === 0) {
    return <p className="muted">No locations configured yet. Add one or more paths, then save.</p>;
  }
  return (
    <ul className="settings-location-list">
      {state.locations.map((location, index) => (
        <li key={`${location.path}-${index}`} className="settings-location-item">
          <span className="settings-location-badge">{index + 1}</span>
          <span className="settings-location-text">{location.path}</span>
          <span className={`settings-library-type-badge settings-library-type-badge-${location.type}`}>
            {location.type === 'music' ? 'Music' : 'Video'}
          </span>
          <button type="button" className="ghost-button small !rounded-lg !px-3 !py-1.5"
            onClick={() => state.removeLocation(index)}>Remove</button>
        </li>
      ))}
    </ul>
  );
}

function ScanProgress({ state }: { state: MediaLocationsState }) {
  const scan = getActiveScan(state.scanProgress);
  if (!scan) return null;
  const percent = getScanProgressPercent(state.scanProgress);
  return (
    <section className="settings-scan-progress" aria-live="polite">
      <div className="settings-scan-progress-head">
        <strong>Scan Status: {formatScanStatus(scan.status)}</strong><span>{percent}%</span>
      </div>
      <div className="settings-scan-progress-bar" role="progressbar" aria-valuemin={0}
        aria-valuemax={100} aria-valuenow={percent}><div style={{ width: `${percent}%` }} /></div>
      <div className="settings-inline-meta">
        <span>Phase: {formatScanPhase(scan.phase)}</span>
        <span>Processed: {scan.processedFiles}/{scan.totalFiles}</span>
        <span>Indexed: {scan.indexedItems}</span>
        <span>Skipped (already indexed): {scan.skippedIndexedFiles}</span>
        {scan.failedFiles > 0 ? <span>Failed: {scan.failedFiles}</span> : null}
      </div>
      {scan.currentFile ? <p className="muted settings-scan-current-file">Current file: {scan.currentFile}</p> : null}
      {scan.message ? <p className="muted settings-scan-message">{scan.message}</p> : null}
    </section>
  );
}

export function MediaLocationsCategory({
  mediaLocationsState,
  configuredLabel,
  isOpen,
  onToggle,
  onAddLocation,
  onScan,
}: MediaLocationsCategoryProps) {
  const {
    locations,
    newLocation,
    setNewLocation,
    newLocationType,
    setNewLocationType,
    locationsSource,
    savingLocations,
    scanBusy,
    locationMessage,
    locationError,
    scanMessage,
    scanError,
    saveLocations,
  } = mediaLocationsState;

  return (
    <SettingsCategorySection
      id="system-media-locations"
      kicker="System Library"
      title="Media Locations"
      description="Configure global media folders for the whole server. These locations are shared by every user account."
      badge={configuredLabel}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="system-media-runtime-column">
        <form className="settings-input-row" onSubmit={onAddLocation}>
          <label className="settings-field">
            <span className="settings-field-label">Path</span>
            <input
              type="text"
              value={newLocation}
              onChange={(event) => setNewLocation(event.target.value)}
              placeholder="Example: D:/Media/Movies or Z:/TV"
            />
          </label>
          <label className="settings-field settings-library-type-field">
            <span className="settings-field-label">Library type</span>
            <select
              value={newLocationType}
              onChange={(event) =>
                setNewLocationType(
                  event.target.value === 'music' ? 'music' : 'video',
                )
              }
              aria-label="Library type"
            >
              <option value="video">Video</option>
              <option value="music">Music</option>
            </select>
          </label>
          <button
            className="ghost-button !rounded-xl !px-4 !py-2"
            type="submit"
          >
            Add Location
          </button>
        </form>

        <div className="settings-inline-meta">
          <span>
            Source:{' '}
            {locationsSource === 'settings'
              ? 'Saved settings'
              : 'Environment defaults'}
          </span>
          <span>{configuredLabel} configured</span>
        </div>

        <MediaLocationList state={mediaLocationsState} />

        <div className="settings-actions-row">
          <button
            className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
            type="button"
            onClick={() => void saveLocations()}
            disabled={savingLocations}
          >
            {savingLocations ? 'Saving...' : 'Save Locations'}
          </button>

          <form onSubmit={onScan}>
            <button
              className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
              type="submit"
              disabled={scanBusy || locations.length === 0}
            >
              {scanBusy ? 'Scanning...' : 'Scan Configured Locations'}
            </button>
          </form>
        </div>

        <ScanProgress state={mediaLocationsState} />

        {locationMessage ? <p className="scan-success">{locationMessage}</p> : null}
        {locationError ? <p className="error-text">{locationError}</p> : null}
        {scanMessage ? <p className="scan-success">{scanMessage}</p> : null}
        {scanError ? <p className="error-text">{scanError}</p> : null}
      </div>
    </SettingsCategorySection>
  );
}
