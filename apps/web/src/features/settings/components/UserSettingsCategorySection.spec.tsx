import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UserSettingsCategorySection } from './UserSettingsCategorySection';
import {
  USER_SETTINGS_SECTION_IDS,
  createUserSettingsQuickActions,
} from './userSettings.types';

describe('UserSettingsCategorySection', () => {
  it('renders the stable section ID used by profile quick navigation', () => {
    const markup = renderToStaticMarkup(
      <UserSettingsCategorySection
        id="user-profile-details"
        kicker="Account"
        title="Profile details"
        description="Update your profile."
        isOpen
        onToggle={vi.fn()}
      >
        <input aria-label="Display name" />
      </UserSettingsCategorySection>,
    );

    expect(markup).toContain('id="user-profile-details"');
    expect(markup).toContain('aria-controls="user-profile-details-content"');
    expect(markup).toContain('id="user-profile-details-content"');
  });

  it('catalogs every rendered profile category as a quick destination', () => {
    const destinationIds = createUserSettingsQuickActions(true, null)
      .map((item) => USER_SETTINGS_SECTION_IDS[item.category]);

    expect(destinationIds).toEqual([
      'user-appearance',
      'user-profile-details',
      'user-profile-picture',
      'user-playback-preferences',
      'user-invites',
      'user-password-reset',
      'user-tv-login',
      'user-tv-display',
    ]);
  });
});
