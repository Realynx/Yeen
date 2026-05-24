import type { FormEvent } from 'react';
import { formatBytes } from '../../shared/services/formatters';
import { UserSettingsCategorySection } from './UserSettingsCategorySection';
import {
  AVATAR_SIZE_UNITS,
  initialForName,
} from './userSettingsViewUtils';

interface UserAvatarSectionProps {
  isOpen: boolean;
  userName: string;
  hasUserAvatar: boolean;
  avatarPreviewUrl: string | null;
  selectedAvatarFile: File | null;
  avatarInputKey: number;
  savingAvatar: boolean;
  avatarMessage: string;
  avatarError: string;
  onToggle: () => void;
  onSelectAvatarFile: (file: File | null) => void;
  onUploadSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClearSelection: () => void;
  onRemoveCurrentPhoto: () => void;
}

export function UserAvatarSection({
  isOpen,
  userName,
  hasUserAvatar,
  avatarPreviewUrl,
  selectedAvatarFile,
  avatarInputKey,
  savingAvatar,
  avatarMessage,
  avatarError,
  onToggle,
  onSelectAvatarFile,
  onUploadSubmit,
  onClearSelection,
  onRemoveCurrentPhoto,
}: UserAvatarSectionProps) {
  return (
    <UserSettingsCategorySection
      id="user-profile-picture"
      kicker="Account"
      title="Profile Picture"
      description="Upload a personal image shown in the profile menu and account surfaces."
      badge={hasUserAvatar ? 'Custom Photo' : 'Initials Avatar'}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <section className="user-settings-avatar-panel" aria-label="Profile picture preview">
        <div className="user-settings-avatar-preview-shell">
          {avatarPreviewUrl ? (
            <img
              src={avatarPreviewUrl}
              alt={`${userName} profile`}
              className="user-settings-avatar-preview"
            />
          ) : (
            <span className="profile-avatar user-settings-avatar-fallback">
              {initialForName(userName)}
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
        onSubmit={onUploadSubmit}
      >
        <label className="settings-field user-settings-upload-box">
          <span className="settings-field-label">Choose Image</span>
          <input
            key={avatarInputKey}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(event) => {
              const nextFile = event.target.files?.[0] ?? null;
              onSelectAvatarFile(nextFile);
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
          onClick={onClearSelection}
          disabled={savingAvatar || !selectedAvatarFile}
        >
          Clear Selection
        </button>

        <button
          type="button"
          className="danger-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
          onClick={onRemoveCurrentPhoto}
          disabled={savingAvatar || !hasUserAvatar}
        >
          Remove Current Photo
        </button>
      </div>

      {avatarMessage ? <p className="scan-success">{avatarMessage}</p> : null}
      {avatarError ? <p className="error-text">{avatarError}</p> : null}
    </UserSettingsCategorySection>
  );
}
