export interface AdminMediaActivityItem {
  mediaId: string;
  title: string;
  updatedAt: string;
  progressPercent: number;
}

export interface AdminAccountActivityItem {
  accountId: string;
  watching: AdminMediaActivityItem[];
  downloading: AdminMediaActivityItem[];
  inProgressCount: number;
  completedCount: number;
  lastActivityAt: string | null;
  isRecentlyActive: boolean;
}

export interface AdminDownloadActivityItem {
  hash: string;
  mediaId: string | null;
  title: string;
  state: string;
  progressPercent: number;
}

export interface AdminAccountsActivitySummary {
  activeAccounts: number;
  activeWatchers: number;
  activeDownloads: number;
  watchEntries: number;
  recentlyActiveAccounts: number;
}

export interface AdminAccountsActivityResponse {
  asOf: string;
  summary: AdminAccountsActivitySummary;
  accounts: AdminAccountActivityItem[];
  downloads: AdminDownloadActivityItem[];
}
