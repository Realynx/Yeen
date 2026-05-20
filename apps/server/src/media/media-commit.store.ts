import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { JsonFileStore } from '../shared/json-file-store';

export type CommitOperation =
  | {
      type: 'rename';
      mediaId?: string;
      from: string;
      to: string;
      role: 'main' | 'sidecar';
    }
  | { type: 'writeNfo'; path: string }
  | { type: 'mkdir'; path: string }
  | {
      type: 'updateDbPath';
      mediaId: string;
      from: string;
      to: string;
      fromRelative: string;
      toRelative: string;
    }
  | {
      /** Snapshot of a file captured in the recycle dir before it was moved. */
      type: 'recycleSnapshot';
      originalPath: string;
      recyclePath: string;
    };

export interface CommitSummary {
  totalItems: number;
  filesRenamed: number;
  sidecarsMoved: number;
  nfoFilesWritten: number;
  directoriesCreated: number;
  errors: number;
}

export interface CommitLogEntry {
  id: string;
  createdAt: string;
  summary: CommitSummary;
  operations: CommitOperation[];
  rolledBackAt: string | null;
  rollbackErrors?: string[];
  /** Absolute path to the recycle snapshot directory for this commit. */
  recycleDir?: string;
}

export interface ChainRollbackCommitResult {
  commitId: string;
  reverted: number;
  errors: string[];
  success: boolean;
}

export interface ChainRollbackResult {
  targetCommitId: string;
  totalToRollback: number;
  completed: number;
  failedAt: string | null;
  results: ChainRollbackCommitResult[];
}

const MAX_HISTORY = 50;

@Injectable()
export class MediaCommitStore extends JsonFileStore<CommitLogEntry[]> {
  constructor() {
    super(join(process.cwd(), 'data', 'metadata-commits.json'), []);
  }

  async list(): Promise<CommitLogEntry[]> {
    await this.ensureLoaded();
    return this.state.map((entry) => this.clone(entry));
  }

  async findById(id: string): Promise<CommitLogEntry | undefined> {
    await this.ensureLoaded();
    const found = this.state.find((entry) => entry.id === id);
    return found ? this.clone(found) : undefined;
  }

  async append(entry: CommitLogEntry): Promise<void> {
    await this.ensureLoaded();
    this.state = [this.clone(entry), ...this.state].slice(0, MAX_HISTORY);
    await this.queueSave();
  }

  async markRolledBack(
    id: string,
    rolledBackAt: string,
    rollbackErrors: string[],
  ): Promise<void> {
    await this.ensureLoaded();
    const next = this.state.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            rolledBackAt,
            rollbackErrors:
              rollbackErrors.length > 0 ? [...rollbackErrors] : undefined,
          }
        : entry,
    );
    this.state = next;
    await this.queueSave();
  }

  protected parseLoadedState(value: unknown): CommitLogEntry[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((entry): entry is CommitLogEntry => {
      return (
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as CommitLogEntry).id === 'string' &&
        Array.isArray((entry as CommitLogEntry).operations)
      );
    });
  }

  protected defaultState(): CommitLogEntry[] {
    return [];
  }

  private clone(entry: CommitLogEntry): CommitLogEntry {
    return JSON.parse(JSON.stringify(entry)) as CommitLogEntry;
  }
}
