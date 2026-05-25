import type { FormEvent } from 'react';
import { UserSettingsCategorySection } from './UserSettingsCategorySection';

interface UserTvPairingSectionProps {
  isOpen: boolean;
  pairingCode: string;
  claimingCode: boolean;
  pairingMessage: string;
  pairingError: string;
  onToggle: () => void;
  onPairingCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function UserTvPairingSection({
  isOpen,
  pairingCode,
  claimingCode,
  pairingMessage,
  pairingError,
  onToggle,
  onPairingCodeChange,
  onSubmit,
}: UserTvPairingSectionProps) {
  return (
    <UserSettingsCategorySection
      id="user-tv-login"
      kicker="Devices"
      title="TV Code Login"
      description="Enter the code shown on your TV app to approve sign-in for that device."
      badge="Pairing"
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <form className="system-settings-form" onSubmit={onSubmit}>
        <label className="settings-field settings-field-wide">
          <span className="settings-field-label">TV Pairing Code</span>
          <input
            type="text"
            value={pairingCode}
            onChange={(event) => onPairingCodeChange(event.target.value)}
            inputMode="text"
            autoComplete="off"
            maxLength={12}
            placeholder="Example: AB12CD"
          />
          <small className="settings-field-hint">
            Codes expire quickly. Open the Yeen TV app first, then enter the code here.
          </small>
        </label>

        <div className="system-settings-footer settings-field-wide">
          <p className="muted">
            Approval is immediate. Your TV signs in automatically once the code is accepted.
          </p>

          <div className="settings-actions-row">
            <button
              type="submit"
              className="accent-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
              disabled={claimingCode}
            >
              {claimingCode ? 'Approving...' : 'Approve TV Code'}
            </button>
          </div>
        </div>
      </form>

      {pairingMessage ? <p className="scan-success">{pairingMessage}</p> : null}
      {pairingError ? <p className="error-text">{pairingError}</p> : null}
    </UserSettingsCategorySection>
  );
}
