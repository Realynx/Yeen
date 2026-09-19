import type { User } from '../../shared/services/types';
import type { RegisteredAddonNavigation } from '../../addons/runtime/addonRuntime.types';
import { canAccessAddonContribution } from '../../addons/runtime/addonRuntimeAccess';
import { isAdminRole } from '../../auth/services/roles';

export type SettingsNavigationIcon =
  | 'profile'
  | 'system'
  | 'accounts'
  | 'addons'
  | 'addon';

export interface SettingsNavigationItem {
  id: string;
  label: string;
  description: string;
  to: string;
  icon: SettingsNavigationIcon;
  end?: boolean;
}

export interface SettingsNavigationGroup {
  id: 'account' | 'administration' | 'extensions';
  label: string;
  items: SettingsNavigationItem[];
}

export function isSettingsNavigationItemActive(
  pathname: string,
  item: SettingsNavigationItem,
): boolean {
  if (item.end) {
    return pathname === item.to;
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function createSettingsNavigation(
  role: User['role'],
  addonNavigation: RegisteredAddonNavigation[] = [],
): SettingsNavigationGroup[] {
  const groups: SettingsNavigationGroup[] = [
    {
      id: 'account',
      label: 'Your account',
      items: [
        {
          id: 'profile',
          label: 'Profile & preferences',
          description: 'Identity, playback, security, and devices',
          to: '/settings',
          icon: 'profile',
          end: true,
        },
      ],
    },
  ];

  if (isAdminRole(role)) {
    groups.push({
      id: 'administration',
      label: 'Administration',
      items: [
        {
          id: 'system',
          label: 'System',
          description: 'Media, runtime, playback, and maintenance',
          to: '/admin/system',
          icon: 'system',
        },
        {
          id: 'accounts',
          label: 'Accounts & access',
          description: 'Roles, invitations, limits, and activity',
          to: '/admin/accounts',
          icon: 'accounts',
        },
        {
          id: 'addons',
          label: 'Add-ons',
          description: 'Packages, updates, and activation',
          to: '/admin/add-ons',
          icon: 'addons',
        },
      ],
    });
  }

  const addonItems = addonNavigation
    .filter((entry) => (
      entry.placement === 'admin'
      && canAccessAddonContribution(role, entry)
    ))
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .map<SettingsNavigationItem>((entry) => ({
      id: `addon:${entry.addon.id}:${entry.id}`,
      label: entry.label,
      description: entry.addon.name,
      to: entry.to,
      icon: 'addon',
    }));

  if (addonItems.length > 0) {
    groups.push({
      id: 'extensions',
      label: 'Extensions',
      items: addonItems,
    });
  }

  return groups;
}
