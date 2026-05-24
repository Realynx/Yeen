import type { FormEvent } from 'react';
import { UserSettingsCategorySection } from './UserSettingsCategorySection';

interface UserProfileDetailsSectionProps {
  isOpen: boolean;
  hasProfileChanges: boolean;
  name: string;
  email: string;
  savingProfile: boolean;
  profileMessage: string;
  profileError: string;
  onToggle: () => void;
  onNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function UserProfileDetailsSection({
  isOpen,
  hasProfileChanges,
  name,
  email,
  savingProfile,
  profileMessage,
  profileError,
  onToggle,
  onNameChange,
  onEmailChange,
  onReset,
  onSubmit,
}: UserProfileDetailsSectionProps) {
  return (
    <UserSettingsCategorySection
      id="user-profile-details"
      kicker="Account"
      title="Profile Details"
      description="Update your display name and email address used for sign-in."
      badge={hasProfileChanges ? 'Unsaved Changes' : 'Up to date'}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <form className="system-settings-form" onSubmit={onSubmit}>
        <label className="settings-field">
          <span className="settings-field-label">Display Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="Your name"
          />
        </label>

        <label className="settings-field">
          <span className="settings-field-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <div className="system-settings-footer settings-field-wide">
          <p className="muted">Changes apply to your account immediately.</p>

          <div className="settings-actions-row">
            <button
              type="button"
              className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
              onClick={onReset}
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
  );
}
