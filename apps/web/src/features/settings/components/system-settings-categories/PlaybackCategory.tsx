import type { SystemSettings } from '../../../shared/services/types';
import type { SystemSettingsState } from '../../services/useSystemSettings';
import { SettingsCategorySection } from './SettingsCategorySection';

interface PlaybackCategoryProps {
  systemSettings: SystemSettings;
  updateSetting: SystemSettingsState['updateSetting'];
}

export function PlaybackCategory({
  systemSettings,
  updateSetting,
}: PlaybackCategoryProps) {
  return (
    <SettingsCategorySection
      id="system-playback"
      kicker="Playback"
      title="Transcode & Metadata Defaults"
      description="Default quality, subtitle, and metadata options used for newly scanned and streamed media."
      badge="Quality Defaults"
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
            Number of random FFmpeg chapter thumbnails generated per media file during scans.
          </small>
        </label>

        <label className="settings-field">
          <span className="settings-field-label">Transcode Preset</span>
          <input
            type="text"
            value={systemSettings.transcodePreset}
            onChange={(event) => updateSetting('transcodePreset', event.target.value)}
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
