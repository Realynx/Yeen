import type { SystemSettingsState } from '../../../pages/settings/useSystemSettings';
import { SettingsCategorySection } from './SettingsCategorySection';

interface RuntimeCategoryProps {
  runtimeSettingsState: Pick<
    SystemSettingsState,
    'systemSettings' | 'loadingSystemSettings' | 'updateSetting'
  >;
}

export function RuntimeCategory({ runtimeSettingsState }: RuntimeCategoryProps) {
  const { systemSettings, loadingSystemSettings, updateSetting } =
    runtimeSettingsState;

  return (
    <SettingsCategorySection
      id="system-runtime"
      kicker="Runtime"
      title="Binaries & Storage"
      description="Core executable and storage paths used for scanning and media processing."
    >
      {loadingSystemSettings ? <p className="muted">Loading runtime settings...</p> : null}

      {systemSettings ? (
        <div className="system-settings-form system-settings-form-single-column">
          <label className="settings-field">
            <span className="settings-field-label">FFmpeg Path</span>
            <input
              type="text"
              value={systemSettings.ffmpegPath}
              onChange={(event) => updateSetting('ffmpegPath', event.target.value)}
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
              onChange={(event) => updateSetting('ffprobePath', event.target.value)}
              placeholder="ffprobe"
            />
            <small className="settings-field-hint">
              Used for metadata extraction during scans.
            </small>
          </label>

          <label className="settings-field">
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
        </div>
      ) : null}
    </SettingsCategorySection>
  );
}