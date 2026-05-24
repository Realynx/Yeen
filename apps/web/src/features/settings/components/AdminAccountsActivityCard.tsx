import type {
  AdminAccountActivityItem,
  AdminDownloadActivityItem,
  AdminManagedAccount,
} from '../../shared/services/types';
import {
  toLastSeenLabel,
  toProgressLabel,
} from './adminAccountsViewUtils';

interface AdminAccountsActivityCardProps {
  loadingActivity: boolean;
  activeAccountActivity: AdminAccountActivityItem[];
  accountsById: Map<string, AdminManagedAccount>;
  activityDownloads: AdminDownloadActivityItem[];
}

export function AdminAccountsActivityCard({
  loadingActivity,
  activeAccountActivity,
  accountsById,
  activityDownloads,
}: AdminAccountsActivityCardProps) {
  return (
    <article className="settings-surface settings-surface-large admin-accounts-activity-card">
      <header className="settings-surface-header">
        <div>
          <p className="settings-section-kicker">Activity</p>
          <h2>User Activity & Media</h2>
        </div>
        <span className="settings-pill">
          {loadingActivity ? 'Loading' : `${activeAccountActivity.length} active`}
        </span>
      </header>

      <p className="muted admin-accounts-section-copy">
        Live view of what your users are watching and what media is currently
        downloading in the queue.
      </p>

      {loadingActivity ? (
        <p className="muted">Loading account activity...</p>
      ) : (
        <div className="admin-accounts-activity-layout">
          <section className="admin-accounts-activity-column">
            <h3 className="admin-accounts-activity-heading">Users Watching / Downloading</h3>

            {activeAccountActivity.length === 0 ? (
              <p className="muted admin-accounts-activity-empty">
                No active user playback or download-linked activity right now.
              </p>
            ) : (
              <ul className="admin-accounts-activity-list">
                {activeAccountActivity.map((activity) => {
                  const account = accountsById.get(activity.accountId);
                  if (!account) {
                    return null;
                  }

                  return (
                    <li key={activity.accountId} className="admin-accounts-activity-item">
                      <div className="admin-accounts-activity-account-line">
                        <p className="admin-accounts-activity-account-name">{account.name}</p>
                        <span className={`settings-account-role-badge is-${account.role}`}>
                          {account.role}
                        </span>
                      </div>

                      {activity.watching.length > 0 ? (
                        <div className="admin-accounts-media-pill-row">
                          {activity.watching.map((item) => (
                            <span key={`watching:${activity.accountId}:${item.mediaId}`} className="admin-accounts-media-pill is-watching">
                              {item.title} ({toProgressLabel(item.progressPercent)})
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {activity.downloading.length > 0 ? (
                        <div className="admin-accounts-media-pill-row">
                          {activity.downloading.map((item) => (
                            <span key={`downloading:${activity.accountId}:${item.mediaId}`} className="admin-accounts-media-pill is-downloading">
                              {item.title} ({toProgressLabel(item.progressPercent)})
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <p className="admin-accounts-activity-meta muted">
                        {activity.inProgressCount} in progress • Last active {toLastSeenLabel(activity.lastActivityAt)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="admin-accounts-activity-column">
            <h3 className="admin-accounts-activity-heading">Active Download Queue</h3>

            {activityDownloads.length === 0 ? (
              <p className="muted admin-accounts-activity-empty">
                No active downloads detected in the queue.
              </p>
            ) : (
              <ul className="admin-accounts-download-list">
                {activityDownloads.map((item) => (
                  <li key={item.hash} className="admin-accounts-download-item">
                    <p className="admin-accounts-download-title">{item.title}</p>
                    <p className="admin-accounts-download-meta muted">
                      {toProgressLabel(item.progressPercent)} • {item.state}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </article>
  );
}
