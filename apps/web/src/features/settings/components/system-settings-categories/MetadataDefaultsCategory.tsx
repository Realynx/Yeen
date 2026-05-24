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
