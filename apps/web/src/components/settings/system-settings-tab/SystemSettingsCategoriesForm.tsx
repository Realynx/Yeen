import type { FormEvent } from 'react';
import type { SystemSettingsState } from '../../../pages/settings/useSystemSettings';
import { MaintenanceCategory } from './MaintenanceCategory';
import { MetadataCategory } from './MetadataCategory';
import { PlaybackCategory } from './PlaybackCategory';
import { TorrentCategory } from './TorrentCategory';

interface SystemSettingsCategoriesFormProps {
  token: string;
  systemSettingsState: SystemSettingsState;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onClearMetadata: () => void;
}

export function SystemSettingsCategoriesForm({
  token,
  systemSettingsState,
  onSave,
  onClearMetadata,
}: SystemSettingsCategoriesFormProps) {
  const {
    systemSettings,
    savingSystemSettings,
    clearingApiCaches,
    clearingMetadataIndex,
    updateSetting,
    clearApiCaches,
  } = systemSettingsState;

  if (!systemSettings) {
    return null;
  }

  return (
    <form
      className="system-settings-form-categories system-settings-form-categories-stacked"
      onSubmit={onSave}
    >
      <PlaybackCategory systemSettings={systemSettings} updateSetting={updateSetting} />

      <TorrentCategory systemSettings={systemSettings} updateSetting={updateSetting} />

      <MetadataCategory token={token} />

      <MaintenanceCategory
        token={token}
        onClearMetadata={onClearMetadata}
        onClearApiCaches={() => void clearApiCaches()}
        clearingMetadataIndex={clearingMetadataIndex}
        savingSystemSettings={savingSystemSettings}
        clearingApiCaches={clearingApiCaches}
      />

      <div className="system-settings-footer">
        <p className="muted">Save to apply these defaults for new playback sessions.</p>
        <div className="settings-actions-row">
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
  );
}
