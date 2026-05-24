import { SettingsCategorySection } from './SettingsCategorySection';
import { RecycleDeletionPanel } from './RecycleDeletionPanel';

interface MaintenanceCategoryProps {
  token: string;
  onClearMetadata: () => void;
  onClearApiCaches: () => void;
  clearingMetadataIndex: boolean;
  savingSystemSettings: boolean;
  clearingApiCaches: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

export function MaintenanceCategory({
  token,
  onClearMetadata,
  onClearApiCaches,
  clearingMetadataIndex,
  savingSystemSettings,
  clearingApiCaches,
  isOpen,
  onToggle,
}: MaintenanceCategoryProps) {
  return (
    <SettingsCategorySection
      id="system-maintenance"
      kicker="Maintenance"
      title="Index & Cache Controls"
      description="Run cleanup actions for metadata and provider caches when you need a fresh rebuild."
      badge="Admin Actions"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="settings-actions-row">
        <button
          className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
          type="button"
          onClick={onClearMetadata}
          disabled={
            clearingMetadataIndex || savingSystemSettings || clearingApiCaches
          }
        >
          {clearingMetadataIndex ? 'Clearing Metadata...' : 'Clear Metadata'}
        </button>

        <button
          className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
          type="button"
          onClick={onClearApiCaches}
          disabled={
            clearingApiCaches || savingSystemSettings || clearingMetadataIndex
          }
        >
          {clearingApiCaches ? 'Clearing API Cache...' : 'Clear API Cache'}
        </button>
      </div>

      <RecycleDeletionPanel
        token={token}
        disabled={
          clearingApiCaches || savingSystemSettings || clearingMetadataIndex
        }
      />
    </SettingsCategorySection>
  );
}
