import { describe, expect, it } from 'vitest';
import type { RegisteredAddonNavigation } from '../../addons/runtime/addonRuntime.types';
import {
  createSettingsNavigation,
  isSettingsNavigationItemActive,
} from './settingsNavigation';

const downloaderNavigation: RegisteredAddonNavigation = {
  addon: {
    id: 'com.yeen.downloader',
    name: 'Downloader Add-on',
    version: '1.0.0',
  },
  id: 'downloads',
  label: 'Downloads',
  to: '/admin/downloads',
  placement: 'admin',
  allowedRoles: ['administrator', 'downloader'],
};

describe('settings navigation', () => {
  it('shows administration destinations only to Administrators', () => {
    const administratorItems = createSettingsNavigation('admin')
      .flatMap((group) => group.items)
      .map((item) => item.id);
    const standardItems = createSettingsNavigation('user')
      .flatMap((group) => group.items)
      .map((item) => item.id);

    expect(administratorItems).toEqual([
      'profile',
      'system',
      'accounts',
      'addons',
    ]);
    expect(standardItems).toEqual(['profile']);
  });

  it('includes only permitted administration contributions from add-ons', () => {
    const administratorItems = createSettingsNavigation('admin', [downloaderNavigation])
      .flatMap((group) => group.items);
    const standardItems = createSettingsNavigation('user', [downloaderNavigation])
      .flatMap((group) => group.items);

    expect(administratorItems.some((item) => item.to === '/admin/downloads')).toBe(true);
    expect(standardItems.some((item) => item.to === '/admin/downloads')).toBe(false);
  });

  it('uses exact matching for Profile and nested matching for administration routes', () => {
    const items = createSettingsNavigation('admin').flatMap((group) => group.items);
    const profile = items.find((item) => item.id === 'profile');
    const system = items.find((item) => item.id === 'system');

    expect(profile).toBeDefined();
    expect(system).toBeDefined();
    expect(isSettingsNavigationItemActive('/settings', profile!)).toBe(true);
    expect(isSettingsNavigationItemActive('/settings/security', profile!)).toBe(false);
    expect(isSettingsNavigationItemActive('/admin/system', system!)).toBe(true);
    expect(isSettingsNavigationItemActive('/admin/system/maintenance', system!)).toBe(true);
    expect(isSettingsNavigationItemActive('/admin/accounts', system!)).toBe(false);
  });
});
