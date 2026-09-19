import { Activity, Download, ShieldCheck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AdminAccountsSummaryCardProps {
  accountsCount: number;
  adminCount: number;
  sailerCount: number;
  userCount: number;
  activeDownloadCount: number;
  recentlyActiveCount: number;
}

export function AdminAccountsSummaryCard({
  accountsCount,
  adminCount,
  sailerCount,
  userCount,
  activeDownloadCount,
  recentlyActiveCount,
}: AdminAccountsSummaryCardProps) {
  return (
    <Card className="settings-surface settings-surface-full">
      <CardHeader className="settings-surface-header p-0">
        <div>
          <p className="settings-section-kicker">Overview</p>
          <CardTitle>Account Summary</CardTitle>
          <CardDescription>
            A compact view of access levels and recent activity.
          </CardDescription>
        </div>
        <Badge variant="secondary">Administrator only</Badge>
      </CardHeader>

      <CardContent className="p-0">
        <div className="admin-accounts-summary-grid" aria-live="polite">
          <Card className="admin-accounts-summary-card">
            <CardHeader className="p-0">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardDescription>Total Accounts</CardDescription>
              <CardTitle className="admin-accounts-summary-value">{accountsCount}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 text-sm text-muted-foreground">
              {userCount} standard · {sailerCount} downloader
            </CardContent>
          </Card>

          <Card className="admin-accounts-summary-card">
            <CardHeader className="p-0">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardDescription>Administrators</CardDescription>
              <CardTitle className="admin-accounts-summary-value">{adminCount}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 text-sm text-muted-foreground">
              Full system and Account access
            </CardContent>
          </Card>

          <Card className="admin-accounts-summary-card">
            <CardHeader className="p-0">
              <Activity className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardDescription>Recently Active</CardDescription>
              <CardTitle className="admin-accounts-summary-value">{recentlyActiveCount}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 text-sm text-muted-foreground">
              Activity recorded in the last 7 days
            </CardContent>
          </Card>

          <Card className="admin-accounts-summary-card">
            <CardHeader className="p-0">
              <Download className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <CardDescription>Active Downloads</CardDescription>
              <CardTitle className="admin-accounts-summary-value">{activeDownloadCount}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 text-sm text-muted-foreground">
              Reported by active add-on sources
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
