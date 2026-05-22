import { MetadataCommitPanel } from '../MetadataCommitPanel';
import { SettingsCategorySection } from './SettingsCategorySection';

interface MetadataCategoryProps {
  token: string;
}

export function MetadataCategory({ token }: MetadataCategoryProps) {
  return (
    <SettingsCategorySection
      id="system-metadata"
      kicker="Metadata"
      title="Commit History & Backup"
      description="Preview commit plans, apply or roll back file metadata moves, and import/export metadata snapshots."
      badge="Advanced Tools"
    >
      <MetadataCommitPanel token={token} embedded />
    </SettingsCategorySection>
  );
}
