import { MetadataCommitPanel } from '../MetadataCommitPanel';
import { SettingsCategorySection } from './SettingsCategorySection';

interface MetadataCategoryProps {
  token: string;
  isOpen: boolean;
  onToggle: () => void;
}

export function MetadataCategory({
  token,
  isOpen,
  onToggle,
}: MetadataCategoryProps) {
  return (
    <SettingsCategorySection
      id="system-metadata-commits"
      kicker="Metadata"
      title="Commit History & Backup"
      description="Preview commit plans, apply or roll back file metadata moves, and import/export metadata snapshots."
      badge="Advanced Tools"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <MetadataCommitPanel token={token} embedded />
    </SettingsCategorySection>
  );
}
