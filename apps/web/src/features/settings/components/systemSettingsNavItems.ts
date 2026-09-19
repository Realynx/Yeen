import type { SystemSettingsNavItem } from './SystemSettingsQuickJumpNav';

export const SYSTEM_SETTINGS_SECTION_IDS = [
  'system-media-locations',
  'system-runtime',
  'system-transcoding',
  'system-metadata-defaults',
  'system-metadata-commits',
  'system-maintenance',
] as const;

export type SystemSettingsSectionId = (typeof SYSTEM_SETTINGS_SECTION_IDS)[number];

export type SystemSettingsNavEntry = Omit<SystemSettingsNavItem, 'id'> & {
  id: SystemSettingsSectionId;
};

export function createCollapsedSectionsState(
  defaultOpenSectionId?: SystemSettingsSectionId,
): Record<SystemSettingsSectionId, boolean> {
  return SYSTEM_SETTINGS_SECTION_IDS.reduce<
    Record<SystemSettingsSectionId, boolean>
  >((state, sectionId) => {
    state[sectionId] = sectionId === defaultOpenSectionId;
    return state;
  }, {} as Record<SystemSettingsSectionId, boolean>);
}

export function createSystemSettingsNavEntries(
  configuredLabel: string,
): SystemSettingsNavEntry[] {
  return [
    {
      id: 'system-media-locations',
      label: 'Media Locations',
      shortLabel: 'Media',
      icon: 'media',
      note: configuredLabel,
    },
    {
      id: 'system-runtime',
      label: 'Binaries & Storage',
      shortLabel: 'Runtime',
      icon: 'runtime',
    },
    {
      id: 'system-transcoding',
      label: 'Transcoding & Throughput',
      shortLabel: 'Transcoding',
      icon: 'playback',
    },
    {
      id: 'system-metadata-defaults',
      label: 'Metadata Defaults',
      shortLabel: 'Metadata',
      icon: 'metadata',
    },
    {
      id: 'system-metadata-commits',
      label: 'Metadata Commits',
      shortLabel: 'Commits',
      icon: 'metadata',
      note: 'Backup & rollback',
    },
    {
      id: 'system-maintenance',
      label: 'Maintenance Tools',
      shortLabel: 'Tools',
      icon: 'maintenance',
    },
  ];
}
