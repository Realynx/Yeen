import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  claimTvPairingCode,
  changeMyPassword,
  createInviteLink,
  removeMyAvatar,
  toApiErrorMessage,
  updateMyProfile,
  uploadMyAvatar,
} from '../../shared/services/api';
import { isAdminRole, roleLabel as toRoleLabel } from '../../auth/services/roles';
import type { User } from '../../shared/services/types';
import { UserSettingsOverviewSidebar } from './UserSettingsOverviewSidebar';
import {
  createUserSettingsQuickActions,
  type UserSettingsCategoryId,
} from './userSettings.types';
import { MAX_AVATAR_BYTES } from './userSettingsViewUtils';
import { UserSettingsSections } from './UserSettingsSections';
import {
  openAndScrollToUserSettingsCategory,
  toggleUserSettingsCategory,
} from './userSettingsCategoryNavigation';
import { AddonSettingsSurfaces } from '../../addons/runtime/AddonHostSlots';

interface UserSettingsTabProps {
  token: string;
  user: User;
  onUserUpdated: (user: User) => void;
}

interface ProfileDraft {
  email: string;
  name: string;
  sourceKey: string;
}

export function UserSettingsTab({ token, user, onUserUpdated }: UserSettingsTabProps) {
  const isAdmin = isAdminRole(user.role);
  const roleLabel = toRoleLabel(user.role);
  const configScopeLabel = isAdmin
    ? 'User + System + Permissions'
    : 'User only';
  const profileSourceKey = `${user.name}\u0000${user.email}`;
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
    email: user.email,
    name: user.name,
    sourceKey: profileSourceKey,
  });
  const activeProfileDraft = profileDraft.sourceKey === profileSourceKey
    ? profileDraft
    : { email: user.email, name: user.name, sourceKey: profileSourceKey };
  const name = activeProfileDraft.name;
  const email = activeProfileDraft.email;

  function updateProfileDraft(patch: Partial<Pick<ProfileDraft, 'email' | 'name'>>) {
    setProfileDraft((previous) => {
      const active = previous.sourceKey === profileSourceKey
        ? previous
        : { email: user.email, name: user.name, sourceKey: profileSourceKey };
      return { ...active, ...patch };
    });
  }

  function setName(value: string) {
    updateProfileDraft({ name: value });
  }

  function setEmail(value: string) {
    updateProfileDraft({ email: value });
  }
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileError, setProfileError] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarInputKey, setAvatarInputKey] = useState(0);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState('');
  const [avatarError, setAvatarError] = useState('');

  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteError, setInviteError] = useState('');
  const [latestInviteUrl, setLatestInviteUrl] = useState('');

  const [pairingCode, setPairingCode] = useState('');
  const [claimingCode, setClaimingCode] = useState(false);
  const [pairingMessage, setPairingMessage] = useState('');
  const [pairingError, setPairingError] = useState('');

  const [expandedCategories, setExpandedCategories] = useState<
    Record<UserSettingsCategoryId, boolean>
  >({
    appearance: false,
    profile: true,
    picture: false,
    playback: false,
    invites: false,
    security: false,
    tv: false,
    tvDisplay: false,
  });

  const availableInvites = isAdmin ? null : Math.max(0, user.invitesRemaining ?? 0);
  const remainingInvitesLabel = isAdmin ? 'Unlimited' : `${availableInvites ?? 0} remaining`;
  const maxBitrateLabel = typeof user.maxBitrateKbps === 'number' && Number.isFinite(user.maxBitrateKbps)
    ? `${user.maxBitrateKbps.toLocaleString()} kbps`
    : 'No limit';

  const hasProfileChanges =
    name.trim() !== user.name || email.trim().toLowerCase() !== user.email.toLowerCase();

  const avatarPreviewUrl = useMemo(() => {
    if (selectedAvatarFile) {
      return URL.createObjectURL(selectedAvatarFile);
    }

    return user.avatarDataUrl ?? null;
  }, [selectedAvatarFile, user.avatarDataUrl]);

  useEffect(() => {
    if (!selectedAvatarFile || !avatarPreviewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl, selectedAvatarFile]);

  async function handleSaveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName || !normalizedEmail) {
      setProfileError('Name and email are required.');
      setProfileMessage('');
      return;
    }

    setSavingProfile(true);
    setProfileError('');
    setProfileMessage('');

    try {
      const updated = await updateMyProfile(token, {
        name: normalizedName,
        email: normalizedEmail,
      });
      onUserUpdated(updated);
      setProfileMessage('Profile details updated.');
    } catch (error) {
      setProfileError(toApiErrorMessage(error, 'Unable to update your profile.'));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Please complete all password fields.');
      setPasswordMessage('');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      setPasswordMessage('');
      return;
    }

    setSavingPassword(true);
    setPasswordError('');
    setPasswordMessage('');

    try {
      const result = await changeMyPassword(token, {
        currentPassword,
        newPassword,
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(result.message || 'Password updated successfully.');
    } catch (error) {
      setPasswordError(toApiErrorMessage(error, 'Unable to update your password.'));
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleUploadAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedAvatarFile) {
      setAvatarError('Choose an image file before uploading.');
      setAvatarMessage('');
      return;
    }

    if (selectedAvatarFile.size > MAX_AVATAR_BYTES) {
      setAvatarError('Profile picture must be 2 MB or smaller.');
      setAvatarMessage('');
      return;
    }

    setSavingAvatar(true);
    setAvatarError('');
    setAvatarMessage('');

    try {
      const updated = await uploadMyAvatar(token, selectedAvatarFile);
      onUserUpdated(updated);
      setSelectedAvatarFile(null);
      setAvatarInputKey((current) => current + 1);
      setAvatarMessage('Profile picture uploaded.');
    } catch (error) {
      setAvatarError(toApiErrorMessage(error, 'Unable to upload profile picture.'));
    } finally {
      setSavingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    if (!user.avatarDataUrl) {
      return;
    }

    if (!window.confirm('Remove your current profile picture?')) {
      return;
    }

    setSavingAvatar(true);
    setAvatarError('');
    setAvatarMessage('');

    try {
      const updated = await removeMyAvatar(token);
      onUserUpdated(updated);
      setSelectedAvatarFile(null);
      setAvatarInputKey((current) => current + 1);
      setAvatarMessage('Profile picture removed.');
    } catch (error) {
      setAvatarError(toApiErrorMessage(error, 'Unable to remove profile picture.'));
    } finally {
      setSavingAvatar(false);
    }
  }

  function clearSelectedAvatar() {
    setSelectedAvatarFile(null);
    setAvatarInputKey((current) => current + 1);
  }

  async function handleCreateInvite() {
    setCreatingInvite(true);
    setInviteError('');
    setInviteMessage('');

    try {
      const result = await createInviteLink(token);
      const inviteUrl = `${window.location.origin}${result.invitePath}`;
      setLatestInviteUrl(inviteUrl);
      setInviteMessage('Invite link created. Share it with your friend.');
      onUserUpdated({
        ...user,
        invitesRemaining: result.remainingInvites,
      });
    } catch (error) {
      setInviteError(toApiErrorMessage(error, 'Unable to create invite link.'));
    } finally {
      setCreatingInvite(false);
    }
  }

  async function handleCopyInviteLink() {
    if (!latestInviteUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(latestInviteUrl);
      setInviteMessage('Invite link copied to clipboard.');
      setInviteError('');
    } catch {
      setInviteError('Copy failed. You can copy the link manually.');
    }
  }

  async function handleApproveTvCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedCode = pairingCode
      .trim()
      .replace(/[^a-z0-9]/gi, '')
      .toUpperCase();

    if (normalizedCode.length !== 6) {
      setPairingError('Enter the 6-character code shown on your TV.');
      setPairingMessage('');
      return;
    }

    setClaimingCode(true);
    setPairingError('');
    setPairingMessage('');

    try {
      const result = await claimTvPairingCode(token, { code: normalizedCode });
      setPairingCode('');
      setPairingMessage(
        `TV code ${result.code} approved. Continue on your TV to finish sign-in.`,
      );
    } catch (error) {
      setPairingError(toApiErrorMessage(error, 'Unable to approve TV code.'));
    } finally {
      setClaimingCode(false);
    }
  }

  const quickActions = useMemo(() => createUserSettingsQuickActions(isAdmin, availableInvites), [availableInvites, isAdmin]);

  return (
    <section className="settings-content-grid" data-tv-focus-zone="shelf">
      <article className="settings-surface settings-surface-full settings-surface-categorized">
        <header className="settings-surface-header user-settings-title-panel">
          <div className="user-settings-title-copy">
            <p className="settings-section-kicker">Account</p>
            <h2>Profile</h2>
          </div>
          <span className="settings-pill user-settings-title-pill">{roleLabel}</span>
        </header>

        <div className="user-settings-layout">
          <UserSettingsOverviewSidebar
            user={user}
            avatarPreviewUrl={avatarPreviewUrl}
            roleLabel={roleLabel}
            configScopeLabel={configScopeLabel}
            remainingInvitesLabel={remainingInvitesLabel}
            maxBitrateLabel={maxBitrateLabel}
            expandedCategories={expandedCategories}
            quickActions={quickActions}
            onOpenCategory={(category) => openAndScrollToUserSettingsCategory(setExpandedCategories, category)}
          />

          <UserSettingsSections
            user={user}
            isAdmin={isAdmin}
            availableInvites={availableInvites}
            expandedCategories={expandedCategories}
            hasProfileChanges={hasProfileChanges}
            name={name}
            email={email}
            savingProfile={savingProfile}
            profileMessage={profileMessage}
            profileError={profileError}
            avatarPreviewUrl={avatarPreviewUrl}
            selectedAvatarFile={selectedAvatarFile}
            avatarInputKey={avatarInputKey}
            savingAvatar={savingAvatar}
            avatarMessage={avatarMessage}
            avatarError={avatarError}
            creatingInvite={creatingInvite}
            latestInviteUrl={latestInviteUrl}
            inviteMessage={inviteMessage}
            inviteError={inviteError}
            currentPassword={currentPassword}
            newPassword={newPassword}
            confirmPassword={confirmPassword}
            savingPassword={savingPassword}
            passwordMessage={passwordMessage}
            passwordError={passwordError}
            pairingCode={pairingCode}
            claimingCode={claimingCode}
            pairingMessage={pairingMessage}
            pairingError={pairingError}
            onToggleCategory={(category) => toggleUserSettingsCategory(setExpandedCategories, category)}
            onNameChange={setName}
            onEmailChange={setEmail}
            onResetProfile={() => {
              setName(user.name);
              setEmail(user.email);
            }}
            onSaveProfile={handleSaveProfile}
            onSelectAvatarFile={setSelectedAvatarFile}
            onUploadAvatar={handleUploadAvatar}
            onClearAvatarSelection={clearSelectedAvatar}
            onRemoveCurrentPhoto={() => { void handleRemoveAvatar(); }}
            onCreateInvite={() => { void handleCreateInvite(); }}
            onCopyLatestInvite={() => { void handleCopyInviteLink(); }}
            onCurrentPasswordChange={setCurrentPassword}
            onNewPasswordChange={setNewPassword}
            onConfirmPasswordChange={setConfirmPassword}
            onChangePassword={handleChangePassword}
            onPairingCodeChange={setPairingCode}
            onApproveTvCode={handleApproveTvCode}
          />
        </div>
      </article>
      <AddonSettingsSurfaces placement="user" />
    </section>
  );
}
