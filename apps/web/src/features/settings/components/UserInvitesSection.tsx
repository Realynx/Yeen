import { UserSettingsCategorySection } from './UserSettingsCategorySection';

interface UserInvitesSectionProps {
  isOpen: boolean;
  isAdmin: boolean;
  availableInvites: number | null;
  creatingInvite: boolean;
  latestInviteUrl: string;
  inviteMessage: string;
  inviteError: string;
  onToggle: () => void;
  onCreateInvite: () => void;
  onCopyLatestInvite: () => void;
}

export function UserInvitesSection({
  isOpen,
  isAdmin,
  availableInvites,
  creatingInvite,
  latestInviteUrl,
  inviteMessage,
  inviteError,
  onToggle,
  onCreateInvite,
  onCopyLatestInvite,
}: UserInvitesSectionProps) {
  return (
    <UserSettingsCategorySection
      id="user-invites"
      kicker="Invites"
      title="Invite Friends"
      description="Generate invite links for new signups. Regular users consume one invite per link."
      badge={isAdmin ? 'Unlimited' : `${availableInvites ?? 0} available`}
      isOpen={isOpen}
      onToggle={onToggle}
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
          onClick={onCreateInvite}
          disabled={creatingInvite || (!isAdmin && (availableInvites ?? 0) <= 0)}
        >
          {creatingInvite ? 'Creating Invite...' : 'Create Invite Link'}
        </button>

        <button
          type="button"
          className="ghost-button !rounded-xl !px-4 !py-2 !text-sm !font-medium"
          onClick={onCopyLatestInvite}
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
  );
}
