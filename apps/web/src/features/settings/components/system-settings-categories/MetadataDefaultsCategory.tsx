import type { SystemSettings } from '../../../shared/services/types';
import type { SystemSettingsState } from '../../services/useSystemSettings';
import { SettingsCategorySection } from './SettingsCategorySection';

interface MetadataDefaultsCategoryProps {
  systemSettings: SystemSettings;
  updateSetting: SystemSettingsState['updateSetting'];
  isOpen: boolean;
  onToggle: () => void;
}

export function MetadataDefaultsCategory({
  systemSettings,
  updateSetting,
  isOpen,
  onToggle,
}: MetadataDefaultsCategoryProps) {
  return (
    <SettingsCategorySection
      id="system-metadata-defaults"
      kicker="Metadata"
      title="Metadata Defaults"
      description="Configure metadata enrichment sources and scan-time metadata generation behavior."
      badge="Library Enrichment"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="system-settings-form">
        <label className="settings-field">
          <span className="settings-field-label">Thumbnails Per Media (1-30)</span>
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
            Number of FFmpeg chapter thumbnails generated per media file during scans.
          </small>
        </label>

        <label className="settings-field settings-field-wide">
          <span className="settings-field-label">TMDB API Key</span>
          <input
            type="password"
            value={systemSettings.tmdbApiKey}
            onChange={(event) => updateSetting('tmdbApiKey', event.target.value)}
            placeholder="TheMovieDB API key"
            autoComplete="off"
          />
          <small className="settings-field-hint">
            Used to enrich scanned media with metadata from themoviedb.org.
          </small>
        </label>

        <div className="settings-field settings-field-wide">
          <span className="settings-field-label">TheAudioDB Music Metadata</span>
          <label className="settings-checkbox-row">
            <input
              type="checkbox"
              checked={systemSettings.theAudioDbEnabled}
              onChange={(event) => updateSetting('theAudioDbEnabled', event.target.checked)}
            />
            <span>Enable remote music search and Discover</span>
          </label>
          <small className="settings-field-hint">
            Uses TheAudioDB&apos;s default free API access unless a custom premium key is configured.
          </small>
        </div>

        <label className="settings-field">
          <span className="settings-field-label">Discover Chart Country</span>
          <input
            type="text"
            maxLength={2}
            value={systemSettings.theAudioDbChartCountry}
            onChange={(event) => updateSetting(
              'theAudioDbChartCountry',
              event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2),
            )}
            placeholder="US"
            autoComplete="country"
          />
          <small className="settings-field-hint">Two-letter country code used for chart results.</small>
        </label>

        <label className="settings-field settings-field-wide">
          <span className="settings-field-label">Custom TheAudioDB Premium API Key</span>
          <input
            type="password"
            value={systemSettings.theAudioDbCustomApiKey ?? ''}
            onChange={(event) => {
              updateSetting(
                'theAudioDbCustomApiKey',
                event.target.value || undefined,
              );
              if (event.target.value) {
                updateSetting('clearTheAudioDbCustomApiKey', false);
              }
            }}
            placeholder={systemSettings.theAudioDbHasCustomApiKey
              ? 'A custom key is configured'
              : 'Optional premium API key'}
            autoComplete="new-password"
            disabled={systemSettings.clearTheAudioDbCustomApiKey === true}
          />
          <small className="settings-field-hint">
            {systemSettings.theAudioDbHasCustomApiKey
              ? 'A custom key is stored securely. It is never returned to this browser; leave this blank to keep it.'
              : 'Leave blank to use the built-in free key.'}
          </small>
        </label>

        {systemSettings.theAudioDbHasCustomApiKey ? (
          <div className="settings-field settings-field-wide">
            <label className="settings-checkbox-row">
              <input
                type="checkbox"
                checked={systemSettings.clearTheAudioDbCustomApiKey === true}
                onChange={(event) => {
                  updateSetting('clearTheAudioDbCustomApiKey', event.target.checked);
                  if (event.target.checked) {
                    updateSetting('theAudioDbCustomApiKey', undefined);
                  }
                }}
              />
              <span>Clear the saved custom key and return to the default free key</span>
            </label>
            <small className="settings-field-hint">
              The saved key is removed only after you select this option and save settings.
            </small>
          </div>
        ) : null}

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
      </div>
    </SettingsCategorySection>
  );
}
