import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { JsonFileStore } from '../../../core/infrastructure/shared/json-file-store';
import { TvPairingRecord } from '../../domain/entities/tv-pairing-record.entity';

interface CreateTvPairingInput {
  code: string;
  pollToken: string;
  clientId?: string | null;
  deviceName?: string | null;
  devicePlatform?: string | null;
  createdAt: string;
  expiresAt: string;
}

interface UpdateTvPairingInput {
  claimedAt?: string | null;
  claimedByAccountId?: string | null;
  consumedAt?: string | null;
}

@Injectable()
export class TvPairingsStore extends JsonFileStore<TvPairingRecord[]> {
  private static readonly STALE_RECORD_RETENTION_MS = 24 * 60 * 60 * 1000;

  constructor() {
    super(join(process.cwd(), 'data', 'tv-pairings.json'), []);
  }

  async findById(id: string): Promise<TvPairingRecord | undefined> {
    await this.ensureLoaded();
    const normalizedId = id.trim();
    return this.state.find((record) => record.id === normalizedId);
  }

  async findByCode(code: string): Promise<TvPairingRecord | undefined> {
    await this.ensureLoaded();
    const normalizedCode = this.normalizeCode(code);
    if (!normalizedCode) {
      return undefined;
    }

    return this.state.find((record) => record.code === normalizedCode);
  }

  async create(input: CreateTvPairingInput): Promise<TvPairingRecord> {
    await this.ensureLoaded();

    const record: TvPairingRecord = {
      id: randomUUID(),
      code: this.normalizeCode(input.code) ?? input.code.trim().toUpperCase(),
      pollToken: input.pollToken.trim(),
      clientId: this.asNullableString(input.clientId),
      deviceName: this.asNullableString(input.deviceName),
      devicePlatform: this.asNullableString(input.devicePlatform),
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      claimedAt: null,
      claimedByAccountId: null,
      consumedAt: null,
    };

    this.state.push(record);
    await this.queueSave();

    return { ...record };
  }

  async updateById(
    id: string,
    input: UpdateTvPairingInput,
  ): Promise<TvPairingRecord | undefined> {
    await this.ensureLoaded();

    const normalizedId = id.trim();
    const index = this.state.findIndex((record) => record.id === normalizedId);
    if (index < 0) {
      return undefined;
    }

    const existing = this.state[index];
    const updated: TvPairingRecord = {
      ...existing,
      claimedAt:
        input.claimedAt !== undefined
          ? this.asNullableString(input.claimedAt)
          : existing.claimedAt,
      claimedByAccountId:
        input.claimedByAccountId !== undefined
          ? this.asNullableString(input.claimedByAccountId)
          : existing.claimedByAccountId,
      consumedAt:
        input.consumedAt !== undefined
          ? this.asNullableString(input.consumedAt)
          : existing.consumedAt,
    };

    this.state[index] = updated;
    await this.queueSave();

    return { ...updated };
  }

  async consumeIfClaimed(
    id: string,
    consumedAt: string,
  ): Promise<TvPairingRecord | undefined> {
    await this.ensureLoaded();

    const normalizedId = id.trim();
    const index = this.state.findIndex((record) => record.id === normalizedId);
    if (index < 0) {
      return undefined;
    }

    const existing = this.state[index];
    if (existing.consumedAt || !existing.claimedAt || !existing.claimedByAccountId) {
      return undefined;
    }

    const updated: TvPairingRecord = {
      ...existing,
      consumedAt: this.asNullableString(consumedAt) ?? new Date().toISOString(),
    };

    this.state[index] = updated;
    await this.queueSave();

    return { ...updated };
  }

  async removeStaleRecords(referenceTimeMs = Date.now()): Promise<void> {
    await this.ensureLoaded();

    const cutoff =
      referenceTimeMs - TvPairingsStore.STALE_RECORD_RETENTION_MS;
    const previousLength = this.state.length;

    this.state = this.state.filter((record) => {
      const consumedAtMs = record.consumedAt
        ? Date.parse(record.consumedAt)
        : Number.NaN;
      if (Number.isFinite(consumedAtMs)) {
        return consumedAtMs >= cutoff;
      }

      const expiresAtMs = Date.parse(record.expiresAt);
      if (!Number.isFinite(expiresAtMs)) {
        return false;
      }

      return expiresAtMs >= cutoff;
    });

    if (this.state.length !== previousLength) {
      await this.queueSave();
    }
  }

  protected parseLoadedState(value: unknown): TvPairingRecord[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const parsed: TvPairingRecord[] = [];

    for (const entry of value) {
      if (!this.isObject(entry)) {
        continue;
      }

      const id = this.asNonEmptyString(entry.id);
      const code = this.normalizeCode(entry.code);
      const pollToken = this.asNonEmptyString(entry.pollToken);
      const createdAt = this.asNonEmptyString(entry.createdAt);
      const expiresAt = this.asNonEmptyString(entry.expiresAt);

      if (!id || !code || !pollToken || !createdAt || !expiresAt) {
        continue;
      }

      parsed.push({
        id,
        code,
        pollToken,
        clientId: this.asNullableString(entry.clientId),
        deviceName: this.asNullableString(entry.deviceName),
        devicePlatform: this.asNullableString(entry.devicePlatform),
        createdAt,
        expiresAt,
        claimedAt: this.asNullableString(entry.claimedAt),
        claimedByAccountId: this.asNullableString(entry.claimedByAccountId),
        consumedAt: this.asNullableString(entry.consumedAt),
      });
    }

    return parsed;
  }

  protected defaultState(): TvPairingRecord[] {
    return [];
  }

  private normalizeCode(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.replace(/[^a-z0-9]/gi, '').toUpperCase();
    return normalized.length >= 4 ? normalized : null;
  }

  private asNonEmptyString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private asNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
