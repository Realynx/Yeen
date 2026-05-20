import type { FormEvent } from 'react';
import type { MediaLocationsState } from '../../pages/settings/useMediaLocations';
import type { SystemSettingsState } from '../../pages/settings/useSystemSettings';
import { MetadataCommitPanel } from './MetadataCommitPanel';

interface SystemSettingsTabProps {
  systemSettingsState: SystemSettingsState;
  mediaLocationsState: MediaLocationsState;
  token: string;
}

function formatScanPhase(phase: string): string {
  switch (phase) {
    case 'collecting':
      return 'Collecting files';
    case 'probing':
      return 'Analyzing media';
    case 'saving':
      return 'Saving index';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return 'Idle';
  }
}

function formatScanStatus(status: string): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return 'Idle';
  }
}

export function SystemSettingsTab({
  systemSettingsState,
  mediaLocationsState,
  token,
}: SystemSettingsTabProps) {
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
    addLocation,
    removeLocation,
    saveLocations,
    scanConfiguredLocations,
  } = mediaLocationsState;

  const {
    systemSettings,
    loadingSystemSettings,
    savingSystemSettings,
    clearingApiCaches,
    clearingMetadataIndex,
    systemMessage,
    systemError,
    updateSetting,
    saveSystemSettings,
    clearApiCaches,
    clearMetadataIndex,
  } = systemSettingsState;

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveSystemSettings();
  }

  function handleAddLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    addLocation();
  }

  function handleScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void scanConfiguredLocations();
  }

  function handleClearMetadata() {
    if (
      !window.confirm(
        'Clear all indexed media metadata? You can rebuild it by scanning your configured locations again.',
      )
    ) {
      return;
    }

    void clearMetadataIndex();
  }

  const configuredLabel =
    locations.length === 1 ? '1 location' : `${locations.length} locations`;
  const progressPercent =
    scanProgress && scanProgress.totalFiles > 0
      ? Math.min(
          100,
          Math.round((scanProgress.processedFiles / scanProgress.totalFiles) * 100),
        )
      : scanProgress?.status === 'completed'
        ? 100
        : 0;
  const showScanProgress = scanProgress ? scanProgress.status !== 'idle' : false;
  const activeScan = showScanProgress ? scanProgress : null;

  return (
    <section className="settings-content-grid">
      <article className="settings-surface settings-surface-full">
        <header className="settings-surface-header">
          <div>
            <p className="settings-section-kicker">System Library</p>
            <h2>Media Locations</h2>
          </div>
          <span className="settings-pill">{configuredLabel}</span>
        </header>

        <p className="muted">
          Configure global media folders for the whole server. These locations are
          shared by every user account.
        </p>

        <form className="settings-input-row" onSubmit={handleAddLocation}>
          <label className="settings-field">
            <span className="settings-field-label">Path</span>
            <input
              type="text"
              value={newLocation}
              onChange={(event) => setNewLocation(event.target.value)}
              placeholder="Example: D:/Media/Movies or Z:/TV"
            />
          </label>
          <button className="ghost-button !rounded-xl !px-4 !py-2" type="submit">
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

          <form onSubmit={handleScan}>
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

            <div className="settings-scan-progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent}>
              <div style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="settings-inline-meta">
              <span>Phase: {formatScanPhase(activeScan.phase)}</span>
              <span>
                Processed: {activeScan.processedFiles}/{activeScan.totalFiles}
              </span>
              <span>Indexed: {activeScan.indexedItems}</span>
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
      </article>

      <article className="settings-surface settings-surface-full">
        <header className="settings-surface-header">
          <div>
            <p className="settings-section-kicker">Admin Controls</p>
            <h2>System Settings</h2>
          </div>
          <span className="settings-pill">Runtime Configuration</span>
        </header>

        <p className="muted">
          Edit runtime paths and transcode defaults. Changes save immediately to
          server config storage.
        </p>

        {loadingSystemSettings ? (
          <p className="muted">Loading system settings...</p>
        ) : null}

        {systemSettings ? (
          <form className="system-settings-form" onSubmit={handleSave}>
            <label className="settings-field">
              <span className="settings-field-label">FFmpeg Path</span>
              <input
                type="text"
                value={systemSettings.ffmpegPath}
                onChange={(event) =>
                  updateSetting('ffmpegPath', event.target.value)
                }
                placeholder="ffmpeg"
              />
              <small className="settings-field-hint">
                Executable command or absolute binary path.
              </small>
            </label>

            <label className="settings-field">
              <span className="settings-field-label">FFprobe Path</span>
              <input
                type="text"
                value={systemSettings.ffprobePath}
                onChange={(event) =>
                  updateSetting('ffprobePath', event.target.value)
                }
                placeholder="ffprobe"
              />
              <small className="settings-field-hint">
                Used for metadata extraction during scans.
              </small>
            </label>

            <label className="settings-field settings-field-wide">
              <span className="settings-field-label">Metadata SQLite File</span>
              <input
                type="text"
                value={systemSettings.mediaMetadataSqlitePath}
                onChange={(event) =>
                  updateSetting('mediaMetadataSqlitePath', event.target.value)
                }
                placeholder="data/media-metadata.sqlite"
              />
              <small className="settings-field-hint">
                Path to the SQLite database used to store scanned media metadata.
              </small>
            </label>

            <label className="settings-field">
              <span className="settings-field-label">
                Thumbnails Per Media (1-30)
              </span>
              <input
                type="number"
                min={1}
                max={30}
                value={systemSettings.thumbnailCaptureCount}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  updateSetting(
                    'thumbnailCaptureCount',
                    Number.isFinite(parsed) ? parsed : 6,
                  );
                }}
              />
              <small className="settings-field-hint">
                Number of random FFmpeg chapter thumbnails generated per media file during scans.
              </small>
            </label>

            <label className="settings-field settings-field-wide">
              <span className="settings-field-label">TMDB API Key</span>
              <input
                type="password"
                value={systemSettings.tmdbApiKey}
                onChange={(event) =>
                  updateSetting('tmdbApiKey', event.target.value)
                }
                placeholder="TheMovieDB API key"
                autoComplete="off"
              />
              <small className="settings-field-hint">
                Used to enrich scanned media with metadata from themoviedb.org.
              </small>
            </label>

            <label className="settings-field settings-field-wide">
              <span className="settings-field-label">OpenSubtitles API Key</span>
              <input
                type="text"
                value={systemSettings.openSubtitlesApiKey}
                onChange={(event) =>
                  updateSetting('openSubtitlesApiKey', event.target.value)
                }
                placeholder="Optional API key"
              />
              <small className="settings-field-hint">
                Optional. Leave blank if you do not use subtitle provider integration.
              </small>
            </label>

            <label className="settings-field">
              <span className="settings-field-label">Transcode Preset</span>
              <input
                type="text"
                value={systemSettings.transcodePreset}
                onChange={(event) =>
                  updateSetting('transcodePreset', event.target.value)
                }
                placeholder="veryfast"
              />
              <small className="settings-field-hint">
                Typical values: ultrafast, veryfast, medium.
              </small>
            </label>

            <label className="settings-field">
              <span className="settings-field-label">Subtitle Language</span>
              <input
                type="text"
                value={systemSettings.subtitleDefaultLanguage}
                onChange={(event) =>
                  updateSetting('subtitleDefaultLanguage', event.target.value)
                }
                placeholder="en"
              />
              <small className="settings-field-hint">
                Preferred ISO language code used for subtitle lookups.
              </small>
            </label>

            <label className="settings-field">
              <span className="settings-field-label">Transcode CRF (12-40)</span>
              <input
                type="number"
                min={12}
                max={40}
                value={systemSettings.transcodeCrf}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  updateSetting('transcodeCrf', Number.isFinite(parsed) ? parsed : 22);
                }}
              />
              <small className="settings-field-hint">
                Lower values improve quality but require more bandwidth.
              </small>
            </label>

            <label className="settings-field">
              <span className="settings-field-label">HLS Segment Seconds (1-20)</span>
              <input
                type="number"
                min={1}
                max={20}
                value={systemSettings.hlsSegmentSeconds}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value, 10);
                  updateSetting(
                    'hlsSegmentSeconds',
                    Number.isFinite(parsed) ? parsed : 4,
                  );
                }}
              />
              <small className="settings-field-hint">
                Shorter segments can improve scrubbing and startup latency.
              </small>
            </label>

            <div className="system-settings-footer">
              <p className="muted">Save to apply these defaults for new playback sessions.</p>
              <div className="settings-actions-row">
                <button
                  className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                  type="button"
                  onClick={handleClearMetadata}
                  disabled={
                    clearingMetadataIndex || savingSystemSettings || clearingApiCaches
                  }
                >
                  {clearingMetadataIndex ? 'Clearing Metadata...' : 'Clear Metadata'}
                </button>

                <button
                  className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                  type="button"
                  onClick={() => void clearApiCaches()}
                  disabled={
                    clearingApiCaches || savingSystemSettings || clearingMetadataIndex
                  }
                >
                  {clearingApiCaches ? 'Clearing API Cache...' : 'Clear API Cache'}
                </button>

                <button
                  className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                  type="submit"
                  disabled={
                    savingSystemSettings || clearingApiCaches || clearingMetadataIndex
                  }
                >
                  {savingSystemSettings ? 'Saving...' : 'Save System Settings'}
                </button>
              </div>
            </div>
          </form>
        ) : null}

        {systemMessage ? <p className="scan-success">{systemMessage}</p> : null}
        {systemError ? <p className="error-text">{systemError}</p> : null}
      </article>

      <MetadataCommitPanel token={token} />
    </section>
  );
}
