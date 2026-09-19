import type { FormEvent } from 'react';
import type { User } from '../../shared/services/types';
import type { UserSettingsCategoryId } from './userSettings.types';
import { UserAvatarSection } from './UserAvatarSection';
import { UserInvitesSection } from './UserInvitesSection';
import { UserProfileDetailsSection } from './UserProfileDetailsSection';
import { UserSecuritySection } from './UserSecuritySection';
import { UserPlaybackPreferencesSection } from './UserPlaybackPreferencesSection';
import { UserTvDisplayPreferencesSection } from './UserTvDisplayPreferencesSection';
import { UserTvPairingSection } from './UserTvPairingSection';
import { UserAppearanceSection } from './UserAppearanceSection';

interface UserSettingsSectionsProps {
  user: User;
  isAdmin: boolean;
  availableInvites: number | null;
  expandedCategories: Record<UserSettingsCategoryId, boolean>;
  hasProfileChanges: boolean;
  name: string;
  email: string;
  savingProfile: boolean;
  profileMessage: string;
  profileError: string;
  avatarPreviewUrl: string | null;
  selectedAvatarFile: File | null;
  avatarInputKey: number;
  savingAvatar: boolean;
  avatarMessage: string;
  avatarError: string;
  creatingInvite: boolean;
  latestInviteUrl: string;
  inviteMessage: string;
  inviteError: string;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  savingPassword: boolean;
  passwordMessage: string;
  passwordError: string;
  pairingCode: string;
  claimingCode: boolean;
  pairingMessage: string;
  pairingError: string;
  onToggleCategory: (category: UserSettingsCategoryId) => void;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onResetProfile: () => void;
  onSaveProfile: (event: FormEvent<HTMLFormElement>) => void;
  onSelectAvatarFile: (file: File | null) => void;
  onUploadAvatar: (event: FormEvent<HTMLFormElement>) => void;
  onClearAvatarSelection: () => void;
  onRemoveCurrentPhoto: () => void;
  onCreateInvite: () => void;
  onCopyLatestInvite: () => void;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onChangePassword: (event: FormEvent<HTMLFormElement>) => void;
  onPairingCodeChange: (value: string) => void;
  onApproveTvCode: (event: FormEvent<HTMLFormElement>) => void;
}

export function UserSettingsSections({
  user,
  isAdmin,
  availableInvites,
  expandedCategories,
  hasProfileChanges,
  name,
  email,
  savingProfile,
  profileMessage,
  profileError,
  avatarPreviewUrl,
  selectedAvatarFile,
  avatarInputKey,
  savingAvatar,
  avatarMessage,
  avatarError,
  creatingInvite,
  latestInviteUrl,
  inviteMessage,
  inviteError,
  currentPassword,
  newPassword,
  confirmPassword,
  savingPassword,
  passwordMessage,
  passwordError,
  pairingCode,
  claimingCode,
  pairingMessage,
  pairingError,
  onToggleCategory,
  onNameChange,
  onEmailChange,
  onResetProfile,
  onSaveProfile,
  onSelectAvatarFile,
  onUploadAvatar,
  onClearAvatarSelection,
  onRemoveCurrentPhoto,
  onCreateInvite,
  onCopyLatestInvite,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onChangePassword,
  onPairingCodeChange,
  onApproveTvCode,
}: UserSettingsSectionsProps) {
  return (
    <div
      className="settings-categories user-settings-categories"
      data-tv-focus-lane-id="user-settings-categories"
    >
      <UserAppearanceSection
        accountId={user.id}
        isOpen={expandedCategories.appearance}
        onToggle={() => onToggleCategory('appearance')}
      />

      <UserProfileDetailsSection
        isOpen={expandedCategories.profile}
        hasProfileChanges={hasProfileChanges}
        name={name}
        email={email}
        savingProfile={savingProfile}
        profileMessage={profileMessage}
        profileError={profileError}
        onToggle={() => onToggleCategory('profile')}
        onNameChange={onNameChange}
        onEmailChange={onEmailChange}
        onReset={onResetProfile}
        onSubmit={onSaveProfile}
      />

      <UserAvatarSection
        isOpen={expandedCategories.picture}
        userName={user.name}
        hasUserAvatar={Boolean(user.avatarDataUrl)}
        avatarPreviewUrl={avatarPreviewUrl}
        selectedAvatarFile={selectedAvatarFile}
        avatarInputKey={avatarInputKey}
        savingAvatar={savingAvatar}
        avatarMessage={avatarMessage}
        avatarError={avatarError}
        onToggle={() => onToggleCategory('picture')}
        onSelectAvatarFile={onSelectAvatarFile}
        onUploadSubmit={onUploadAvatar}
        onClearSelection={onClearAvatarSelection}
        onRemoveCurrentPhoto={onRemoveCurrentPhoto}
      />

      <UserPlaybackPreferencesSection
        isOpen={expandedCategories.playback}
        onToggle={() => onToggleCategory('playback')}
      />

      <UserInvitesSection
        isOpen={expandedCategories.invites}
        isAdmin={isAdmin}
        availableInvites={availableInvites}
        creatingInvite={creatingInvite}
        latestInviteUrl={latestInviteUrl}
        inviteMessage={inviteMessage}
        inviteError={inviteError}
        onToggle={() => onToggleCategory('invites')}
        onCreateInvite={onCreateInvite}
        onCopyLatestInvite={onCopyLatestInvite}
      />

      <UserSecuritySection
        isOpen={expandedCategories.security}
        currentPassword={currentPassword}
        newPassword={newPassword}
        confirmPassword={confirmPassword}
        savingPassword={savingPassword}
        passwordMessage={passwordMessage}
        passwordError={passwordError}
        onToggle={() => onToggleCategory('security')}
        onCurrentPasswordChange={onCurrentPasswordChange}
        onNewPasswordChange={onNewPasswordChange}
        onConfirmPasswordChange={onConfirmPasswordChange}
        onSubmit={onChangePassword}
      />

      <UserTvPairingSection
        isOpen={expandedCategories.tv}
        pairingCode={pairingCode}
        claimingCode={claimingCode}
        pairingMessage={pairingMessage}
        pairingError={pairingError}
        onToggle={() => onToggleCategory('tv')}
        onPairingCodeChange={onPairingCodeChange}
        onSubmit={onApproveTvCode}
      />

      <UserTvDisplayPreferencesSection
        isOpen={expandedCategories.tvDisplay}
        onToggle={() => onToggleCategory('tvDisplay')}
      />
    </div>
  );
}
