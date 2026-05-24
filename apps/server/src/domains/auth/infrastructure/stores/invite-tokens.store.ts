import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { JsonFileStore } from '../../../core/infrastructure/shared/json-file-store';
import { AccountInviteRecord } from '../../domain/entities/account-invite-record.entity';

interface CreateInviteInput {
  token: string;
  inviterAccountId: string;
}

@Injectable()
export class InviteTokensStore extends JsonFileStore<AccountInviteRecord[]> {
  constructor() {
    super(join(process.cwd(), 'data', 'account-invites.json'), []);
  }

  async findByToken(token: string): Promise<AccountInviteRecord | undefined> {
    await this.ensureLoaded();
    const normalized = token.trim();
    return this.state.find((invite) => invite.token === normalized);
  }

  async create(input: CreateInviteInput): Promise<AccountInviteRecord> {
    await this.ensureLoaded();

    const record: AccountInviteRecord = {
      id: randomUUID(),
      token: input.token.trim(),
      inviterAccountId: input.inviterAccountId.trim(),
      createdAt: new Date().toISOString(),
      usedAt: null,
      usedByAccountId: null,
    };

    this.state.push(record);
    await this.queueSave();

    return record;
  }

  async markUsed(
    token: string,
    usedByAccountId: string,
  ): Promise<AccountInviteRecord | undefined> {
    await this.ensureLoaded();

    const normalizedToken = token.trim();
    const inviteIndex = this.state.findIndex(
      (invite) => invite.token === normalizedToken,
    );

    if (inviteIndex < 0) {
      return undefined;
    }

    const existing = this.state[inviteIndex];
    if (existing.usedAt) {
      return existing;
    }

    const updated: AccountInviteRecord = {
      ...existing,
      usedAt: new Date().toISOString(),
      usedByAccountId: usedByAccountId.trim(),
    };

    this.state[inviteIndex] = updated;
    await this.queueSave();

    return updated;
  }

  protected parseLoadedState(value: unknown): AccountInviteRecord[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const parsed: AccountInviteRecord[] = [];

    for (const entry of value) {
      if (!this.isObject(entry)) {
        continue;
      }

      const id = this.asNonEmptyString(entry.id);
      const token = this.asNonEmptyString(entry.token);
      const inviterAccountId = this.asNonEmptyString(entry.inviterAccountId);
      const createdAt = this.asNonEmptyString(entry.createdAt);

      if (!id || !token || !inviterAccountId || !createdAt) {
        continue;
      }

      parsed.push({
        id,
        token,
        inviterAccountId,
        createdAt,
        usedAt: this.asNullableString(entry.usedAt),
        usedByAccountId: this.asNullableString(entry.usedByAccountId),
      });
    }

    return parsed;
  }

  protected defaultState(): AccountInviteRecord[] {
    return [];
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
