import type { FormEvent } from 'react';
import { UserSettingsCategorySection } from './UserSettingsCategorySection';

interface UserSecuritySectionProps {
  isOpen: boolean;
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  savingPassword: boolean;
  passwordMessage: string;
  passwordError: string;
  onToggle: () => void;
  onCurrentPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function UserSecuritySection({
  isOpen,
  currentPassword,
  newPassword,
  confirmPassword,
  savingPassword,
  passwordMessage,
  passwordError,
  onToggle,
  onCurrentPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
}: UserSecuritySectionProps) {
  return (
    <UserSettingsCategorySection
      id="user-password-reset"
      kicker="Security"
      title="Reset Password"
      description="Confirm your current password, then set a new one for your own account."
      badge="Self-Service"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <form className="system-settings-form" onSubmit={onSubmit}>
        <label className="settings-field">
          <span className="settings-field-label">Current Password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => onCurrentPasswordChange(event.target.value)}
            autoComplete="current-password"
          />
        </label>

        <label className="settings-field">
          <span className="settings-field-label">New Password</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => onNewPasswordChange(event.target.value)}
            autoComplete="new-password"
          />
          <small className="settings-field-hint">Use at least 8 characters.</small>
        </label>

        <label className="settings-field settings-field-wide">
          <span className="settings-field-label">Confirm New Password</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => onConfirmPasswordChange(event.target.value)}
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
  );
}
