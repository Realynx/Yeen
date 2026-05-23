import { MediaItem } from '../../domain/entities/media-item.entity.ts/media-item.entity';
import { CommitOperation, CommitSummary } from '../../infrastructure/stores/media-commit.store';

export interface PlannedOperation {
  type: CommitOperation['type'];
  mediaId?: string;
  from?: string;
  to?: string;
  path?: string;
  role?: 'main' | 'sidecar';
}

export interface PlannedMediaChange {
  mediaId: string;
  title: string;
  type: MediaItem['type'];
  currentPath: string;
  targetPath: string;
  willMove: boolean;
  sidecars: Array<{ from: string; to: string }>;
  nfoPath: string | null;
  reason?: string;
  skipped?: boolean;
}

export interface CommitPlan {
  changes: PlannedMediaChange[];
  skipped: PlannedMediaChange[];
  summary: {
    totalItems: number;
    movableItems: number;
    skippedItems: number;
    sidecars: number;
    nfoFiles: number;
  };
}

export interface CommitResult {
  commitId: string;
  summary: CommitSummary;
  changes: Array<{
    mediaId: string;
    title: string;
    from: string;
    to: string;
    sidecarCount: number;
    nfoWritten: boolean;
    error?: string;
  }>;
}

export interface RollbackResult {
  commitId: string;
  reverted: number;
  errors: string[];
}
