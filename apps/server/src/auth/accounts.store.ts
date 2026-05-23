import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { JsonFileStore } from '../shared/json-file-store';
import { AccountRecord } from './entities/account-record.entity';

interface CreateAccountInput {
  email: string;
  name: string;
  passwordHash: string;
  role?: 'admin' | 'sailer' | 'user';
  invitesRemaining?: number | null;
  invitedByAccountId?: string | null;
}

interface UpdateAccountInput {
  email?: string;
  name?: string;
  passwordHash?: string;
  avatarDataUrl?: string | null;
  role?: 'admin' | 'sailer' | 'user';
  invitesRemaining?: number | null;
  invitedByAccountId?: string | null;
}

@Injectable()
export class AccountsStore extends JsonFileStore<AccountRecord[]> {
  constructor() {
    super(join(process.cwd(), 'data', 'accounts.json'), []);
  }

  async findByEmail(email: string): Promise<AccountRecord | undefined> {
    await this.ensureLoaded();
    const normalized = email.trim().toLowerCase();
    return this.state.find((account) => account.email === normalized);
  }

  async findById(id: string): Promise<AccountRecord | undefined> {
    await this.ensureLoaded();
    return this.state.find((account) => account.id === id);
  }

  async list(): Promise<AccountRecord[]> {
    await this.ensureLoaded();
    return this.state.map((account) => ({ ...account }));
  }

  async create(input: CreateAccountInput): Promise<AccountRecord> {
    await this.ensureLoaded();

    const role = input.role ?? this.defaultRole();
    const normalizedInviterId = this.asNullableString(input.invitedByAccountId);

    const account: AccountRecord = {
      id: randomUUID(),
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash: input.passwordHash,
      avatarDataUrl: null,
      role,
      invitesRemaining:
        role === 'admin'
          ? null
          : this.normalizeInviteCount(input.invitesRemaining, 0),
      invitedByAccountId: normalizedInviterId,
      createdAt: new Date().toISOString(),
    };

    this.state.push(account);
    await this.queueSave();

    return account;
  }

  async updateById(
    id: string,
    input: UpdateAccountInput,
  ): Promise<AccountRecord | undefined> {
    await this.ensureLoaded();

    const accountIndex = this.state.findIndex((account) => account.id === id);
    if (accountIndex < 0) {
      return undefined;
    }

    const existing = this.state[accountIndex];
    const role =
      input.role === 'admin' || input.role === 'sailer' || input.role === 'user'
        ? input.role
        : existing.role;
    const updated: AccountRecord = {
      ...existing,
      email:
        typeof input.email === 'string'
          ? input.email.trim().toLowerCase()
          : existing.email,
      name: typeof input.name === 'string' ? input.name.trim() : existing.name,
      passwordHash:
        typeof input.passwordHash === 'string'
          ? input.passwordHash
          : existing.passwordHash,
      avatarDataUrl:
        input.avatarDataUrl !== undefined
          ? input.avatarDataUrl
          : existing.avatarDataUrl,
      role,
      invitesRemaining:
        role === 'admin'
          ? null
          : input.invitesRemaining !== undefined
            ? this.normalizeInviteCount(
                input.invitesRemaining,
                existing.invitesRemaining ?? 0,
              )
            : existing.role === 'admin'
              ? 0
              : (existing.invitesRemaining ?? 0),
      invitedByAccountId:
        input.invitedByAccountId !== undefined
          ? this.asNullableString(input.invitedByAccountId)
          : existing.invitedByAccountId,
    };

    this.state[accountIndex] = updated;
    await this.queueSave();

    return updated;
  }

  private defaultRole(): 'admin' | 'sailer' | 'user' {
    return this.state.length === 0 ? 'admin' : 'user';
  }

  protected parseLoadedState(value: unknown): AccountRecord[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const parsed: AccountRecord[] = [];

    for (const entry of value) {
      if (!this.isObject(entry)) {
        continue;
      }

      const id = this.asNonEmptyString(entry.id);
      const email = this.asNonEmptyString(entry.email);
      const name = this.asNonEmptyString(entry.name);
      const passwordHash = this.asNonEmptyString(entry.passwordHash);
      const createdAt = this.asNonEmptyString(entry.createdAt);

      if (!id || !email || !name || !passwordHash || !createdAt) {
        continue;
      }

      const role =
        entry.role === 'admin' ||
        entry.role === 'sailer' ||
        entry.role === 'user'
          ? entry.role
          : 'user';
      const invitesRemaining =
        role === 'admin'
          ? null
          : (this.asNonNegativeInteger(entry.invitesRemaining) ?? 0);

      parsed.push({
        id,
        email: email.trim().toLowerCase(),
        name: name.trim(),
        passwordHash,
        avatarDataUrl: this.asNullableString(entry.avatarDataUrl),
        role,
        invitesRemaining,
        invitedByAccountId: this.asNullableString(entry.invitedByAccountId),
        createdAt,
      });
    }

    return parsed;
  }

  protected defaultState(): AccountRecord[] {
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

  private asNonNegativeInteger(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return null;
    }

    const rounded = Math.floor(value);
    return rounded >= 0 ? rounded : 0;
  }

  private normalizeInviteCount(value: unknown, fallback: number): number {
    const normalized = this.asNonNegativeInteger(value);
    return normalized ?? fallback;
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
