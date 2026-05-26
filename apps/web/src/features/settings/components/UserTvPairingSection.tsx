import type { FormEvent } from 'react';
import { UserSettingsCategorySection } from './UserSettingsCategorySection';

function normalizePairingCode(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 6);
}

function formatPairingCode(value: string): string {
  const normalized = normalizePairingCode(value);
  return normalized.length > 3
    ? `${normalized.slice(0, 3)} ${normalized.slice(3)}`
    : normalized;
}

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
  const normalizedPairingCode = normalizePairingCode(pairingCode);
  const pairingCodeComplete = normalizedPairingCode.length === 6;

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
            value={formatPairingCode(pairingCode)}
            onChange={(event) => onPairingCodeChange(normalizePairingCode(event.target.value))}
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            placeholder="Example: AB12CD"
            aria-describedby="tv-pairing-code-hint"
          />
          <small id="tv-pairing-code-hint" className="settings-field-hint">
            Codes expire quickly. Letters are auto-capitalized and grouped as {formatPairingCode('AB12CD')}.
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
              data-tv-focus-key="settings-tv-pairing-submit"
              disabled={claimingCode || !pairingCodeComplete}
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
