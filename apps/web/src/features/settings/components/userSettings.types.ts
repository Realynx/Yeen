export type UserSettingsCategoryId =
  | 'profile'
  | 'picture'
  | 'invites'
  | 'security'
  | 'tv';

export const USER_SETTINGS_SECTION_IDS: Record<UserSettingsCategoryId, string> = {
  profile: 'user-profile-details',
  picture: 'user-profile-picture',
  invites: 'user-invites',
  security: 'user-password-reset',
  tv: 'user-tv-login',
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
  ];
}
