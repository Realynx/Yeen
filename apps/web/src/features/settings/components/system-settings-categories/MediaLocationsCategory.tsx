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
  onAddLocation: (event: FormEvent<HTMLFormElement>) => void;
  onScan: (event: FormEvent<HTMLFormElement>) => void;
}

export function MediaLocationsCategory({
  mediaLocationsState,
  configuredLabel,
  onAddLocation,
  onScan,
}: MediaLocationsCategoryProps) {
  const {
    locations,
    newLocation,
    setNewLocation,
    locationsSource,
    loadingLocations,
    savingLocations,
    scanBusy,
    scanProgress,
    locationMessage,
    locationError,
    scanMessage,
    scanError,
    removeLocation,
    saveLocations,
  } = mediaLocationsState;

  const activeScan = getActiveScan(scanProgress);
  const progressPercent = getScanProgressPercent(scanProgress);

  return (
    <SettingsCategorySection
      id="system-media-locations"
      kicker="System Library"
      title="Media Locations"
      description="Configure global media folders for the whole server. These locations are shared by every user account."
      badge={configuredLabel}
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

        {loadingLocations ? <p className="muted">Loading media locations...</p> : null}

        {!loadingLocations && locations.length === 0 ? (
          <p className="muted">
            No locations configured yet. Add one or more paths, then save.
          </p>
        ) : null}

        <ul className="settings-location-list">
          {locations.map((location, index) => (
            <li key={`${location}-${index}`} className="settings-location-item">
              <span className="settings-location-badge">{index + 1}</span>
              <span className="settings-location-text">{location}</span>
              <button
                type="button"
                className="ghost-button small !rounded-lg !px-3 !py-1.5"
                onClick={() => removeLocation(index)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>

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

        {activeScan ? (
          <section className="settings-scan-progress" aria-live="polite">
            <div className="settings-scan-progress-head">
              <strong>Scan Status: {formatScanStatus(activeScan.status)}</strong>
              <span>{progressPercent}%</span>
            </div>

            <div
              className="settings-scan-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <div style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="settings-inline-meta">
              <span>Phase: {formatScanPhase(activeScan.phase)}</span>
              <span>
                Processed: {activeScan.processedFiles}/{activeScan.totalFiles}
              </span>
              <span>Indexed: {activeScan.indexedItems}</span>
              <span>Skipped (already indexed): {activeScan.skippedIndexedFiles}</span>
              {activeScan.failedFiles > 0 ? (
                <span>Failed: {activeScan.failedFiles}</span>
              ) : null}
            </div>

            {activeScan.currentFile ? (
              <p className="muted settings-scan-current-file">
                Current file: {activeScan.currentFile}
              </p>
            ) : null}

            {activeScan.message ? (
              <p className="muted settings-scan-message">{activeScan.message}</p>
            ) : null}
          </section>
        ) : null}

        {locationMessage ? <p className="scan-success">{locationMessage}</p> : null}
        {locationError ? <p className="error-text">{locationError}</p> : null}
        {scanMessage ? <p className="scan-success">{scanMessage}</p> : null}
        {scanError ? <p className="error-text">{scanError}</p> : null}
      </div>
    </SettingsCategorySection>
  );
}
