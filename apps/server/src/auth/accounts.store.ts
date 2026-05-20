import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { JsonFileStore } from '../shared/json-file-store';
import { AccountRecord } from './entities/account-record.entity';

interface CreateAccountInput {
  email: string;
  name: string;
  passwordHash: string;
  role?: 'admin' | 'user';
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

  async create(input: CreateAccountInput): Promise<AccountRecord> {
    await this.ensureLoaded();

    const account: AccountRecord = {
      id: randomUUID(),
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      passwordHash: input.passwordHash,
      role: input.role ?? this.defaultRole(),
      createdAt: new Date().toISOString(),
    };

    this.state.push(account);
    await this.queueSave();

    return account;
  }

  private defaultRole(): 'admin' | 'user' {
    return this.state.length === 0 ? 'admin' : 'user';
  }

  protected parseLoadedState(value: unknown): AccountRecord[] {
    return Array.isArray(value) ? (value as AccountRecord[]) : [];
  }

  protected defaultState(): AccountRecord[] {
    return [];
  }
}
