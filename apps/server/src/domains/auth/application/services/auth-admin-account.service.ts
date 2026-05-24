import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AccountRecord } from '../../domain/entities/account-record.entity';
import { AccountsStore } from '../../infrastructure/stores/accounts.store';
import { CreateAdminAccountDto } from '../dto/create-admin-account.dto';
import { UpdateAccountInvitesDto } from '../dto/update-account-invites.dto';
import { UpdateAccountRoleDto } from '../dto/update-account-role.dto';
import { toSafeAccount } from '../helpers/auth-account-helpers';

@Injectable()
export class AuthAdminAccountService {
  constructor(private readonly accountsStore: AccountsStore) {}

  async listAccountsForAdmin() {
    const accounts = await this.accountsStore.list();
    const accountsById = new Map(accounts.map((account) => [account.id, account]));

    const normalized = accounts
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((account) => ({
        ...toSafeAccount(account),
        invitedByName: account.invitedByAccountId
          ? (accountsById.get(account.invitedByAccountId)?.name ?? null)
          : null,
      }));

    return {
      accounts: normalized,
    };
  }

  async setAccountInvites(accountId: string, dto: UpdateAccountInvitesDto) {
    const account = await this.requireAccount(accountId);

    if (account.role === 'admin') {
      return toSafeAccount(account);
    }

    const updated = await this.accountsStore.updateById(account.id, {
      invitesRemaining: dto.invitesRemaining,
    });

    if (!updated) {
      throw new UnauthorizedException('Account not found.');
    }

    return toSafeAccount(updated);
  }

  async setAccountRole(accountId: string, dto: UpdateAccountRoleDto) {
    const account = await this.requireAccount(accountId);
    const nextRole =
      dto.role === 'admin' || dto.role === 'sailer' || dto.role === 'user'
        ? dto.role
        : 'user';

    if (account.role === nextRole) {
      return toSafeAccount(account);
    }

    if (account.role === 'admin' && nextRole !== 'admin') {
      const accounts = await this.accountsStore.list();
      const adminCount = accounts.filter((entry) => entry.role === 'admin').length;

      if (adminCount <= 1) {
        throw new BadRequestException('At least one admin account is required.');
      }
    }

    const updated = await this.accountsStore.updateById(account.id, {
      role: nextRole,
      invitesRemaining: account.invitesRemaining ?? 0,
    });

    if (!updated) {
      throw new UnauthorizedException('Account not found.');
    }

    return toSafeAccount(updated);
  }

  async createAccountAsAdmin(dto: CreateAdminAccountDto) {
    const existing = await this.accountsStore.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered.');
    }

    const role =
      dto.role === 'admin' || dto.role === 'sailer' || dto.role === 'user'
        ? dto.role
        : 'user';
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const account = await this.accountsStore.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
      role,
      invitesRemaining: role === 'admin' ? null : (dto.invitesRemaining ?? 0),
    });

    return toSafeAccount(account);
  }

  private async requireAccount(userId: string): Promise<AccountRecord> {
    const account = await this.accountsStore.findById(userId);
    if (!account) {
      throw new UnauthorizedException('Account not found.');
    }

    return account;
  }
}
