interface AdminAccountsSummaryCardProps {
  accountsCount: number;
  adminCount: number;
  sailerCount: number;
  userCount: number;
  totalInvites: number;
  customBitrateCount: number;
  activeAccountCount: number;
  activeWatcherCount: number;
  activeDownloadCount: number;
  recentlyActiveCount: number;
  accountsMessage: string | null;
  accountsError: string | null;
}

export function AdminAccountsSummaryCard({
  accountsCount,
  adminCount,
  sailerCount,
  userCount,
  totalInvites,
  customBitrateCount,
  activeAccountCount,
  activeWatcherCount,
  activeDownloadCount,
  recentlyActiveCount,
  accountsMessage,
  accountsError,
}: AdminAccountsSummaryCardProps) {
  return (
    <article className="settings-surface settings-surface-full">
      <header className="settings-surface-header">
        <div>
          <p className="settings-section-kicker">Identity</p>
          <h2>Account & Access</h2>
        </div>
        <span className="settings-pill">Admin Only</span>
      </header>

      <div className="admin-accounts-summary-grid" aria-live="polite">
        <article className="admin-accounts-summary-card">
          <p className="admin-accounts-summary-kicker">Total Accounts</p>
          <p className="admin-accounts-summary-value">{accountsCount}</p>
          <p className="admin-accounts-summary-note">All active profiles</p>
        </article>

        <article className="admin-accounts-summary-card">
          <p className="admin-accounts-summary-kicker">Admins</p>
          <p className="admin-accounts-summary-value">{adminCount}</p>
          <p className="admin-accounts-summary-note">Unlimited invite access</p>
        </article>

        <article className="admin-accounts-summary-card">
          <p className="admin-accounts-summary-kicker">Sailers</p>
          <p className="admin-accounts-summary-value">{sailerCount}</p>
          <p className="admin-accounts-summary-note">
            Torrent search and downloads
          </p>
        </article>

        <article className="admin-accounts-summary-card">
          <p className="admin-accounts-summary-kicker">Users</p>
          <p className="admin-accounts-summary-value">{userCount}</p>
          <p className="admin-accounts-summary-note">Media-only access</p>
        </article>

        <article className="admin-accounts-summary-card">
          <p className="admin-accounts-summary-kicker">Invites Remaining</p>
          <p className="admin-accounts-summary-value">{totalInvites}</p>
          <p className="admin-accounts-summary-note">Across user accounts</p>
        </article>

        <article className="admin-accounts-summary-card">
          <p className="admin-accounts-summary-kicker">Bitrate Overrides</p>
          <p className="admin-accounts-summary-value">{customBitrateCount}</p>
          <p className="admin-accounts-summary-note">Custom transcode caps</p>
        </article>

        <article className="admin-accounts-summary-card">
          <p className="admin-accounts-summary-kicker">Active Accounts</p>
          <p className="admin-accounts-summary-value">{activeAccountCount}</p>
          <p className="admin-accounts-summary-note">Watching or downloading now</p>
        </article>

        <article className="admin-accounts-summary-card">
          <p className="admin-accounts-summary-kicker">Watching Now</p>
          <p className="admin-accounts-summary-value">{activeWatcherCount}</p>
          <p className="admin-accounts-summary-note">Users in playback progress</p>
        </article>

        <article className="admin-accounts-summary-card">
          <p className="admin-accounts-summary-kicker">Active Downloads</p>
          <p className="admin-accounts-summary-value">{activeDownloadCount}</p>
          <p className="admin-accounts-summary-note">
            Recently active users: {recentlyActiveCount}
          </p>
        </article>
      </div>

      {accountsMessage ? <p className="scan-success">{accountsMessage}</p> : null}
      {accountsError ? <p className="error-text">{accountsError}</p> : null}
    </article>
  );
}
