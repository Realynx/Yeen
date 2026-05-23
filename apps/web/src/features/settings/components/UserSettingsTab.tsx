import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  changeMyPassword,
  createInviteLink,
  removeMyAvatar,
  toApiErrorMessage,
  updateMyProfile,
  uploadMyAvatar,
} from '../../shared/services/api';
import { formatBytes } from '../../shared/services/formatters';
import { isAdminRole, roleLabel as toRoleLabel } from '../../auth/services/roles';
import type { User } from '../../shared/services/types';

interface UserSettingsTabProps {
  token: string;
  user: User;
  onUserUpdated: (user: User) => void;
}

type UserSettingsCategoryId = 'profile' | 'picture' | 'invites' | 'security';

interface UserSettingsCategorySectionProps {
  id: string;
  kicker: string;
  title: string;
  description: string;
  badge?: string;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_SIZE_UNITS = ['B', 'KB', 'MB'] as const;

function UserSettingsCategorySection({
  id,
  kicker,
  title,
  description,
  badge,
  isOpen,
  onToggle,
  children,
}: UserSettingsCategorySectionProps) {
  const contentId = `${id}-content`;

  return (
    <section className={`settings-category${isOpen ? ' is-open' : ''}`}>
      <button
        type="button"
        className="settings-category-toggle"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <div className="settings-category-toggle-copy">
          <p className="settings-section-kicker">{kicker}</p>
          <h3>{title}</h3>
          <p className="muted">{description}</p>
        </div>

        <div className="settings-category-toggle-meta">
          {badge ? <span className="settings-pill">{badge}</span> : null}
          <span
            className={`settings-category-chevron${isOpen ? ' is-open' : ''}`}
            aria-hidden="true"
          >
            v
          </span>
        </div>
      </button>

      {isOpen ? (
        <div id={contentId} className="settings-category-content">
          {children}
        </div>
      ) : null}
    </section>
  );
}

function formatMemberSince(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(parsed));
}

function initialForName(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return 'U';
  }

  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function UserSettingsTab({ token, user, onUserUpdated }: UserSettingsTabProps) {
  const isAdmin = isAdminRole(user.role);
  const roleLabel = toRoleLabel(user.role);
  const configScopeLabel = isAdmin
    ? 'User + System + Permissions'
    : user.role === 'sailer'
      ? 'User + Torrent'
      : 'User only';
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
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

  const [expandedCategories, setExpandedCategories] = useState<
    Record<UserSettingsCategoryId, boolean>
  >({
    profile: true,
    picture: true,
    invites: true,
    security: false,
  });

  const availableInvites = isAdmin ? null : Math.max(0, user.invitesRemaining ?? 0);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(user.name);
    setEmail(user.email);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user.email, user.name]);

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

  function toggleCategory(category: UserSettingsCategoryId) {
    setExpandedCategories((current) => ({
      ...current,
      [category]: !current[category],
    }));
  }

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

  return (
    <section className="settings-content-grid">
      <article className="settings-surface settings-surface-full settings-surface-categorized">
        <header className="settings-surface-header user-settings-title-panel">
          <div className="user-settings-title-copy">
            <p className="settings-section-kicker">Account</p>
            <h2>Profile</h2>
          </div>
          <span className="settings-pill user-settings-title-pill">{roleLabel}</span>
        </header>

        <p className="muted user-settings-title-description">
          Manage your own profile details, password, and account picture. System-wide
          runtime and library settings remain in the admin System Settings page.
        </p>
        <p className="settings-inline-meta user-settings-title-meta">
          {isAdmin
            ? 'Admin account: user profile settings are shown here; system controls stay in System Settings.'
            : 'Personal account controls: profile, invites, avatar, and password.'}
        </p>

        <div className="settings-categories user-settings-categories">
          <UserSettingsCategorySection
            id="user-profile-details"
            kicker="Account"
            title="Profile Details"
            description="Update your display name and email address used for sign-in."
            badge={hasProfileChanges ? 'Unsaved Changes' : 'Up to date'}
            isOpen={expandedCategories.profile}
            onToggle={() => toggleCategory('profile')}
          >
            <form className="system-settings-form" onSubmit={handleSaveProfile}>
              <label className="settings-field">
                <span className="settings-field-label">Display Name</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                />
              </label>

              <label className="settings-field">
                <span className="settings-field-label">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>

              <dl className="settings-profile-list user-settings-profile-summary settings-field-wide">
                <div>
                  <dt>Role</dt>
                  <dd>{roleLabel}</dd>
                </div>
                <div>
                  <dt>Member Since</dt>
                  <dd>{formatMemberSince(user.createdAt)}</dd>
                </div>
                <div>
                  <dt>Config Scope</dt>
                  <dd>{configScopeLabel}</dd>
                </div>
              </dl>

              <div className="system-settings-footer settings-field-wide">
                <p className="muted">Changes apply to your account immediately.</p>

                <div className="settings-actions-row">
                  <button
                    type="button"
                    className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                    onClick={() => {
                      setName(user.name);
                      setEmail(user.email);
                    }}
                    disabled={savingProfile || !hasProfileChanges}
                  >
                    Reset
                  </button>

                  <button
                    type="submit"
                    className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                    disabled={savingProfile || !hasProfileChanges}
                  >
                    {savingProfile ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </div>
            </form>

            {profileMessage ? <p className="scan-success">{profileMessage}</p> : null}
            {profileError ? <p className="error-text">{profileError}</p> : null}
          </UserSettingsCategorySection>

          <UserSettingsCategorySection
            id="user-profile-picture"
            kicker="Account"
            title="Profile Picture"
            description="Upload a personal image shown in the profile menu and account surfaces."
            badge={user.avatarDataUrl ? 'Custom Photo' : 'Initials Avatar'}
            isOpen={expandedCategories.picture}
            onToggle={() => toggleCategory('picture')}
          >
            <section className="user-settings-avatar-panel" aria-label="Profile picture preview">
              <div className="user-settings-avatar-preview-shell">
                {avatarPreviewUrl ? (
                  <img
                    src={avatarPreviewUrl}
                    alt={`${user.name} profile`}
                    className="user-settings-avatar-preview"
                  />
                ) : (
                  <span className="profile-avatar user-settings-avatar-fallback">
                    {initialForName(user.name)}
                  </span>
                )}
              </div>

              <div className="user-settings-avatar-copy">
                <p className="settings-field-label">Current Picture</p>
                <p className="muted">
                  PNG, JPEG, WEBP, or GIF. Maximum size: 2 MB.
                </p>
                {selectedAvatarFile ? (
                  <p className="muted user-settings-avatar-selected">
                    Selected: {selectedAvatarFile.name} ({formatBytes(selectedAvatarFile.size, { units: AVATAR_SIZE_UNITS })})
                  </p>
                ) : null}
              </div>
            </section>

            <form
              id="user-avatar-upload-form"
              className="user-settings-avatar-form"
              onSubmit={handleUploadAvatar}
            >
              <label className="settings-field user-settings-upload-box">
                <span className="settings-field-label">Choose Image</span>
                <input
                  key={avatarInputKey}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0] ?? null;
                    setSelectedAvatarFile(nextFile);
                  }}
                />
                <small className="settings-field-hint">
                  Uploading replaces your existing profile picture.
                </small>
              </label>
            </form>

            <div className="settings-actions-row user-settings-avatar-actions">
              <button
                type="submit"
                form="user-avatar-upload-form"
                className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                disabled={savingAvatar || !selectedAvatarFile}
              >
                {savingAvatar ? 'Uploading...' : 'Upload Photo'}
              </button>

              <button
                type="button"
                className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                onClick={clearSelectedAvatar}
                disabled={savingAvatar || !selectedAvatarFile}
              >
                Clear Selection
              </button>

              <button
                type="button"
                className="danger-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                onClick={() => void handleRemoveAvatar()}
                disabled={savingAvatar || !user.avatarDataUrl}
              >
                Remove Current Photo
              </button>
            </div>

            {avatarMessage ? <p className="scan-success">{avatarMessage}</p> : null}
            {avatarError ? <p className="error-text">{avatarError}</p> : null}
          </UserSettingsCategorySection>

          <UserSettingsCategorySection
            id="user-invites"
            kicker="Invites"
            title="Invite Friends"
            description="Generate invite links for new signups. Regular users consume one invite per link."
            badge={
              isAdmin
                ? 'Unlimited'
                : `${availableInvites ?? 0} available`
            }
            isOpen={expandedCategories.invites}
            onToggle={() => toggleCategory('invites')}
          >
            <p className="settings-invite-balance">
              {isAdmin
                ? 'As an admin, you can create unlimited invite links.'
                : `You currently have ${availableInvites ?? 0} invite(s) remaining.`}
            </p>

            <div className="settings-actions-row">
              <button
                type="button"
                className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                onClick={() => void handleCreateInvite()}
                disabled={
                  creatingInvite ||
                  (!isAdmin && (availableInvites ?? 0) <= 0)
                }
              >
                {creatingInvite ? 'Creating Invite...' : 'Create Invite Link'}
              </button>

              <button
                type="button"
                className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                onClick={() => void handleCopyInviteLink()}
                disabled={!latestInviteUrl}
              >
                Copy Latest Link
              </button>
            </div>

            {latestInviteUrl ? (
              <label className="settings-field settings-field-wide">
                <span className="settings-field-label">Latest Invite URL</span>
                <input
                  className="settings-invite-link-input"
                  type="text"
                  value={latestInviteUrl}
                  readOnly
                />
                <small className="settings-field-hint">
                  Anyone with this URL can access the invite signup page.
                </small>
              </label>
            ) : null}

            {inviteMessage ? <p className="scan-success">{inviteMessage}</p> : null}
            {inviteError ? <p className="error-text">{inviteError}</p> : null}
          </UserSettingsCategorySection>

          <UserSettingsCategorySection
            id="user-password-reset"
            kicker="Security"
            title="Reset Password"
            description="Confirm your current password, then set a new one for your own account."
            badge="Self-Service"
            isOpen={expandedCategories.security}
            onToggle={() => toggleCategory('security')}
          >
            <form className="system-settings-form" onSubmit={handleChangePassword}>
              <label className="settings-field">
                <span className="settings-field-label">Current Password</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>

              <label className="settings-field">
                <span className="settings-field-label">New Password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                />
                <small className="settings-field-hint">Use at least 8 characters.</small>
              </label>

              <label className="settings-field settings-field-wide">
                <span className="settings-field-label">Confirm New Password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </label>

              <div className="system-settings-footer settings-field-wide">
                <p className="muted">
                  This only changes your own account password.
                </p>

                <div className="settings-actions-row">
                  <button
                    type="submit"
                    className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
                    disabled={savingPassword}
                  >
                    {savingPassword ? 'Saving...' : 'Update Password'}
                  </button>
                </div>
              </div>
            </form>

            {passwordMessage ? <p className="scan-success">{passwordMessage}</p> : null}
            {passwordError ? <p className="error-text">{passwordError}</p> : null}
          </UserSettingsCategorySection>
        </div>
      </article>
    </section>
  );
}
