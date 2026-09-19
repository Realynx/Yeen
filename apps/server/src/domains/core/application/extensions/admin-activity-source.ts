import { Injectable } from '@nestjs/common';

export const ADMIN_ACTIVITY_SOURCES = Symbol.for(
  'com.yeen.addons.admin-activity-sources.v1',
);

export interface ExternalAdminActivityItem {
  externalId: string;
  mediaId: string | null;
  title: string;
  state: string;
  progressPercent: number;
}

export interface AdminActivitySourceAdapter {
  readonly adapterId: string;
  listActiveItems(): Promise<ExternalAdminActivityItem[]>;
}

@Injectable()
export class AdminActivitySourceRegistry {
  private readonly adapters = new Map<string, AdminActivitySourceAdapter>();

  register(adapter: AdminActivitySourceAdapter): () => void {
    if (this.adapters.has(adapter.adapterId)) {
      throw new Error(
        `Admin activity adapter already registered: ${adapter.adapterId}`,
      );
    }
    this.adapters.set(adapter.adapterId, adapter);
    return () => {
      if (this.adapters.get(adapter.adapterId) === adapter)
        this.adapters.delete(adapter.adapterId);
    };
  }

  async listActiveItems(): Promise<ExternalAdminActivityItem[]> {
    const items = await Promise.all(
      [...this.adapters.values()].map((adapter) =>
        adapter.listActiveItems().catch(() => []),
      ),
    );
    return items.flat();
  }
}
