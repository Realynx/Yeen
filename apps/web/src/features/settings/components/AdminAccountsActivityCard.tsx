import { RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type {
  AdminAccountActivityItem,
  AdminDownloadActivityItem,
  AdminManagedAccount,
} from '../../shared/services/types';
import {
  toAccountRoleLabel,
  toLastSeenLabel,
  toProgressLabel,
} from './adminAccountsViewUtils';

interface AdminAccountsActivityCardProps {
  loadingActivity: boolean;
  activityError: string | null;
  activityAsOf: string | null;
  activeAccountActivity: AdminAccountActivityItem[];
  accountsById: Map<string, AdminManagedAccount>;
  activityDownloads: AdminDownloadActivityItem[];
  onRefresh: () => Promise<void>;
}

export function AdminAccountsActivityCard({
  loadingActivity,
  activityError,
  activityAsOf,
  activeAccountActivity,
  accountsById,
  activityDownloads,
  onRefresh,
}: AdminAccountsActivityCardProps) {
  return (
    <Card className="settings-surface settings-surface-large admin-accounts-activity-card !col-span-12">
      <CardHeader className="settings-surface-header p-0">
        <div>
          <p className="settings-section-kicker">Activity snapshot</p>
          <CardTitle>Account Activity</CardTitle>
          <CardDescription>
            Watch Progress and active Downloader Add-on work at one point in time.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingActivity}
          onClick={() => void onRefresh()}
        >
          <RefreshCw className={loadingActivity ? 'animate-spin' : ''} aria-hidden="true" />
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {activityAsOf ? (
          <p className="mb-3 text-xs text-muted-foreground">
            Snapshot updated {toLastSeenLabel(activityAsOf)}
          </p>
        ) : null}

        {activityError ? (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Activity unavailable</AlertTitle>
            <AlertDescription>{activityError}</AlertDescription>
          </Alert>
        ) : loadingActivity ? (
          <div className="grid gap-3" aria-label="Loading Account activity">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <div className="admin-accounts-activity-layout">
            <section className="admin-accounts-activity-column">
              <h3 className="admin-accounts-activity-heading">Accounts with activity</h3>

              {activeAccountActivity.length === 0 ? (
                <p className="muted admin-accounts-activity-empty">
                  No Account playback or download-linked activity in this snapshot.
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
                          <Badge variant="outline">{toAccountRoleLabel(account.role)}</Badge>
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
                          {activity.inProgressCount} in progress · Last activity {toLastSeenLabel(activity.lastActivityAt)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="admin-accounts-activity-column">
              <h3 className="admin-accounts-activity-heading">Active download queue</h3>

              {activityDownloads.length === 0 ? (
                <p className="muted admin-accounts-activity-empty">
                  No active downloads reported by installed add-ons.
                </p>
              ) : (
                <ul className="admin-accounts-download-list">
                  {activityDownloads.map((item) => (
                    <li key={item.hash} className="admin-accounts-download-item">
                      <p className="admin-accounts-download-title">{item.title}</p>
                      <p className="admin-accounts-download-meta muted">
                        {toProgressLabel(item.progressPercent)} · {item.state}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
