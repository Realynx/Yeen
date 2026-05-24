export interface AdminAccountMediaActivityItem {
  mediaId: string;
  title: string;
  updatedAt: string;
  progressPercent: number;
}

export interface AdminAccountActivityItem {
  accountId: string;
  watching: AdminAccountMediaActivityItem[];
  downloading: AdminAccountMediaActivityItem[];
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

export interface AdminAccountsActivityOverview {
  asOf: string;
  summary: {
    activeAccounts: number;
    activeWatchers: number;
    activeDownloads: number;
    watchEntries: number;
    recentlyActiveAccounts: number;
  };
  accounts: AdminAccountActivityItem[];
  downloads: AdminDownloadActivityItem[];
}
