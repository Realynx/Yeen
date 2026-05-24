import type { FormEvent } from 'react';
import type { SystemSettingsState } from '../../services/useSystemSettings';
import { MaintenanceCategory } from './MaintenanceCategory';
import { MetadataCategory } from './MetadataCategory';
import { MetadataDefaultsCategory } from './MetadataDefaultsCategory';
import { PlaybackCategory } from './PlaybackCategory';
import { TorrentCategory } from './TorrentCategory';

interface SystemSettingsCategoriesFormProps {
  token: string;
  systemSettingsState: SystemSettingsState;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onClearMetadata: () => void;
  playbackIsOpen: boolean;
  onTogglePlayback: () => void;
  metadataDefaultsIsOpen: boolean;
  onToggleMetadataDefaults: () => void;
  torrentClientIsOpen: boolean;
  onToggleTorrentClient: () => void;
  torrentProvidersIsOpen: boolean;
  onToggleTorrentProviders: () => void;
  metadataCommitsIsOpen: boolean;
  onToggleMetadataCommits: () => void;
  maintenanceIsOpen: boolean;
  onToggleMaintenance: () => void;
}

export function SystemSettingsCategoriesForm({
  token,
  systemSettingsState,
  onSave,
  onClearMetadata,
  playbackIsOpen,
  onTogglePlayback,
  metadataDefaultsIsOpen,
  onToggleMetadataDefaults,
  torrentClientIsOpen,
  onToggleTorrentClient,
  torrentProvidersIsOpen,
  onToggleTorrentProviders,
  metadataCommitsIsOpen,
  onToggleMetadataCommits,
  maintenanceIsOpen,
  onToggleMaintenance,
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
      <PlaybackCategory
        systemSettings={systemSettings}
        updateSetting={updateSetting}
        isOpen={playbackIsOpen}
        onToggle={onTogglePlayback}
      />

      <MetadataDefaultsCategory
        systemSettings={systemSettings}
        updateSetting={updateSetting}
        isOpen={metadataDefaultsIsOpen}
        onToggle={onToggleMetadataDefaults}
      />

      <TorrentCategory
        systemSettings={systemSettings}
        updateSetting={updateSetting}
        clientIsOpen={torrentClientIsOpen}
        onToggleClient={onToggleTorrentClient}
        providersIsOpen={torrentProvidersIsOpen}
        onToggleProviders={onToggleTorrentProviders}
      />

      <MetadataCategory
        token={token}
        isOpen={metadataCommitsIsOpen}
        onToggle={onToggleMetadataCommits}
      />

      <MaintenanceCategory
        token={token}
        onClearMetadata={onClearMetadata}
        onClearApiCaches={() => void clearApiCaches()}
        clearingMetadataIndex={clearingMetadataIndex}
        savingSystemSettings={savingSystemSettings}
        clearingApiCaches={clearingApiCaches}
        isOpen={maintenanceIsOpen}
        onToggle={onToggleMaintenance}
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
