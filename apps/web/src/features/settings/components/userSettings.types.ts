export type UserSettingsCategoryId =
  | 'appearance'
  | 'profile'
  | 'picture'
  | 'playback'
  | 'invites'
  | 'security'
  | 'tv'
  | 'tvDisplay';

export const USER_SETTINGS_SECTION_IDS: Record<UserSettingsCategoryId, string> = {
  appearance: 'user-appearance',
  profile: 'user-profile-details',
  picture: 'user-profile-picture',
  playback: 'user-playback-preferences',
  invites: 'user-invites',
  security: 'user-password-reset',
  tv: 'user-tv-login',
  tvDisplay: 'user-tv-display',
};

export interface UserSettingsQuickAction {
  category: UserSettingsCategoryId;
  label: string;
  note: string;
}

export function createUserSettingsQuickActions(
  isAdmin: boolean,
  availableInvites: number | null,
): UserSettingsQuickAction[] {
  return [
    {
      category: 'appearance',
      label: 'Appearance',
      note: 'Theme for this browser',
    },
    {
      category: 'profile',
      label: 'Account Details',
      note: 'Display name and email',
    },
    {
      category: 'picture',
      label: 'Profile Photo',
      note: 'Avatar upload and removal',
    },
    {
      category: 'playback',
      label: 'Playback',
      note: 'Subtitle defaults',
    },
    {
      category: 'invites',
      label: 'Invite Links',
      note: isAdmin
        ? 'Create unlimited invites'
        : `${availableInvites ?? 0} invite(s) available`,
    },
    {
      category: 'security',
      label: 'Password',
      note: 'Reset your sign-in password',
    },
    {
      category: 'tv',
      label: 'TV Login',
      note: 'Approve a code from your TV app',
    },
    {
      category: 'tvDisplay',
      label: 'TV Display',
      note: 'Readability, focus, and motion',
    },
  ];
}
