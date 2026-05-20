import { Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { JsonFileStore } from '../shared/json-file-store';
import { ProgressEntry } from './entities/progress-entry.entity';

@Injectable()
export class ProgressStore extends JsonFileStore<ProgressEntry[]> {
  constructor() {
    super(join(process.cwd(), 'data', 'watch-progress.json'), []);
  }

  async listForUser(userId: string): Promise<ProgressEntry[]> {
    await this.ensureLoaded();
    return this.state
      .filter((entry) => entry.userId === userId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async get(
    userId: string,
    mediaId: string,
  ): Promise<ProgressEntry | undefined> {
    await this.ensureLoaded();
    return this.state.find((entry) => {
      return entry.userId === userId && entry.mediaId === mediaId;
    });
  }

  async upsert(next: ProgressEntry): Promise<ProgressEntry> {
    await this.ensureLoaded();

    const existingIndex = this.state.findIndex((entry) => {
      return entry.userId === next.userId && entry.mediaId === next.mediaId;
    });

    if (existingIndex >= 0) {
      this.state[existingIndex] = next;
    } else {
      this.state.push(next);
    }

    await this.queueSave();
    return next;
  }

  protected parseLoadedState(value: unknown): ProgressEntry[] {
    return Array.isArray(value) ? (value as ProgressEntry[]) : [];
  }

  protected defaultState(): ProgressEntry[] {
    return [];
  }
}
