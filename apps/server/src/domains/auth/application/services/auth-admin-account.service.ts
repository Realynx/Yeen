import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { MediaService } from '../../../media/application/services/media.service';
import { ProgressService } from '../../../progress/application/services/progress.service';
import {
  TorrentService,
  type TorrentListItem,
} from '../../../torrent/application/services/torrent.service';
import { TorrentMediaIndexStore } from '../../../torrent/infrastructure/stores/torrent-media-index.store';
import { AccountRecord } from '../../domain/entities/account-record.entity';
import { AccountsStore } from '../../infrastructure/stores/accounts.store';
import { CreateAdminAccountDto } from '../dto/create-admin-account.dto';
import { ResetAccountPasswordDto } from '../dto/reset-account-password.dto';
import { UpdateAccountInvitesDto } from '../dto/update-account-invites.dto';
import { UpdateAccountMaxBitrateDto } from '../dto/update-account-max-bitrate.dto';
import { UpdateAccountRoleDto } from '../dto/update-account-role.dto';
import { UpdateAdminAccountProfileDto } from '../dto/update-admin-account-profile.dto';
import { toSafeAccount } from '../helpers/auth-account-helpers';
import {
  isActiveDownloadValue,
  toMediaActivityItemValue,
  toProgressPercentValue,
} from './auth-admin-account-activity.helpers';
import type {
  AdminAccountActivityItem,
  AdminAccountsActivityResponse,
  AdminAccountsActivitySummary,
  AdminDownloadActivityItem,
} from './auth-admin-account.types';

@Injectable()
export class AuthAdminAccountService {
  constructor(
    private readonly accountsStore: AccountsStore,
    private readonly progressService: ProgressService,
    private readonly mediaService: MediaService,
    private readonly torrentService: TorrentService,
    private readonly torrentMediaIndexStore: TorrentMediaIndexStore,
  ) {}

  async listAccountsForAdmin() {
    const accounts = await this.accountsStore.list();
    const accountsById = new Map(
      accounts.map((account) => [account.id, account]),
    );

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

  async listAccountsActivityForAdmin(): Promise<AdminAccountsActivityResponse> {
    const [accounts, torrentSnapshot] = await Promise.all([
      this.accountsStore.list(),
      this.torrentService
        .listTorrents()
        .catch(() => ({ items: [] as TorrentListItem[] })),
    ]);

    const progressByAccountEntries = await Promise.all(
      accounts.map(async (account) => {
        const entries = await this.progressService.listForAccount(account.id);
        return [account.id, entries] as const;
      }),
    );
    const progressByAccount = new Map(progressByAccountEntries);

    const activeTorrents = torrentSnapshot.items.filter((item) =>
      isActiveDownloadValue(item),
    );
    const indexedTorrentEntries = await Promise.all(
      activeTorrents.map(async (item) => {
        const indexed = await this.torrentMediaIndexStore.get(item.hash);
        return [item.hash, indexed] as const;
      }),
    );
    const indexedByHash = new Map(indexedTorrentEntries);

    const mediaIds = new Set<string>();
    for (const entries of progressByAccount.values()) {
      for (const entry of entries) {
        mediaIds.add(entry.mediaId);
      }
    }

    for (const entry of indexedByHash.values()) {
      if (entry?.mediaId) {
        mediaIds.add(entry.mediaId);
      }
    }

    const mediaTitles = await this.resolveMediaTitles(Array.from(mediaIds));

    const downloads: AdminDownloadActivityItem[] = activeTorrents
      .map((item) => {
        const indexed = indexedByHash.get(item.hash) ?? null;
        const mediaId = indexed?.mediaId ?? null;
        const fallbackTitle = item.name.trim() || 'Unknown torrent';
        const title =
          (mediaId ? mediaTitles.get(mediaId) : null) ?? fallbackTitle;

        return {
          hash: item.hash,
          mediaId,
          title,
          state: item.state,
          progressPercent: toProgressPercentValue(item.progress),
        };
      })
      .sort((left, right) => right.progressPercent - left.progressPercent);

    const activeDownloadMediaIds = new Set<string>(
      downloads
        .map((item) => item.mediaId)
        .filter((mediaId): mediaId is string => typeof mediaId === 'string'),
    );

    const nowMs = Date.now();
    const accountActivities: AdminAccountActivityItem[] = accounts
      .map((account) => {
        const entries = (progressByAccount.get(account.id) ?? [])
          .slice()
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

        const watchingEntries = entries.filter(
          (entry) => !entry.completed && entry.positionSeconds > 0,
        );
        const watching = watchingEntries
          .slice(0, 3)
          .map((entry) => toMediaActivityItemValue(entry, mediaTitles));
        const downloading = watchingEntries
          .filter((entry) => activeDownloadMediaIds.has(entry.mediaId))
          .slice(0, 3)
          .map((entry) => toMediaActivityItemValue(entry, mediaTitles));

        const lastActivityAt = entries[0]?.updatedAt ?? null;
        const parsedLastActivityAt =
          lastActivityAt === null ? Number.NaN : Date.parse(lastActivityAt);
        const isRecentlyActive =
          Number.isFinite(parsedLastActivityAt) &&
          nowMs - parsedLastActivityAt <= 1000 * 60 * 60 * 24 * 7;

        return {
          accountId: account.id,
          watching,
          downloading,
          inProgressCount: watchingEntries.length,
          completedCount: entries.filter((entry) => entry.completed).length,
          lastActivityAt,
          isRecentlyActive,
        };
      })
      .sort((left, right) => {
        const leftValue = left.lastActivityAt ?? '';
        const rightValue = right.lastActivityAt ?? '';
        return rightValue.localeCompare(leftValue);
      });

    const summary: AdminAccountsActivitySummary = {
      activeAccounts: accountActivities.filter(
        (entry) => entry.watching.length > 0 || entry.downloading.length > 0,
      ).length,
      activeWatchers: accountActivities.filter(
        (entry) => entry.watching.length > 0,
      ).length,
      activeDownloads: downloads.length,
      watchEntries: accountActivities.reduce(
        (sum, entry) => sum + entry.inProgressCount + entry.completedCount,
        0,
      ),
      recentlyActiveAccounts: accountActivities.filter(
        (entry) => entry.isRecentlyActive,
      ).length,
    };

    return {
      asOf: new Date().toISOString(),
      summary,
      accounts: accountActivities,
      downloads,
    };
  }

  async setAccountProfile(
    accountId: string,
    dto: UpdateAdminAccountProfileDto,
  ) {
    const account = await this.requireAccount(accountId);
    const nextEmail = dto.email.trim().toLowerCase();
    const nextName = dto.name.trim();

    if (nextEmail !== account.email) {
      const existing = await this.accountsStore.findByEmail(nextEmail);
      if (existing && existing.id !== account.id) {
        throw new ConflictException('Email is already registered.');
      }
    }

    if (nextEmail === account.email && nextName === account.name) {
      return toSafeAccount(account);
    }

    const updated = await this.accountsStore.updateById(account.id, {
      email: nextEmail,
      name: nextName,
    });

    if (!updated) {
      throw new UnauthorizedException('Account not found.');
    }

    return toSafeAccount(updated);
  }

  async resetAccountPassword(accountId: string, dto: ResetAccountPasswordDto) {
    const account = await this.requireAccount(accountId);
    const matchesCurrent = await bcrypt.compare(
      dto.newPassword,
      account.passwordHash,
    );
    if (matchesCurrent) {
      throw new BadRequestException(
        'New password must be different from current password.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const updated = await this.accountsStore.updateById(account.id, {
      passwordHash,
    });

    if (!updated) {
      throw new UnauthorizedException('Account not found.');
    }

    return {
      message: 'Account password reset successfully.',
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
      const adminCount = accounts.filter(
        (entry) => entry.role === 'admin',
      ).length;

      if (adminCount <= 1) {
        throw new BadRequestException(
          'At least one admin account is required.',
        );
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

  async setAccountMaxBitrate(
    accountId: string,
    dto: UpdateAccountMaxBitrateDto,
  ) {
    const account = await this.requireAccount(accountId);
    const nextMaxBitrateKbps =
      typeof dto.maxBitrateKbps === 'number' ? dto.maxBitrateKbps : null;

    if ((account.maxBitrateKbps ?? null) === nextMaxBitrateKbps) {
      return toSafeAccount(account);
    }

    const updated = await this.accountsStore.updateById(account.id, {
      maxBitrateKbps: nextMaxBitrateKbps,
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
      maxBitrateKbps:
        typeof dto.maxBitrateKbps === 'number' ? dto.maxBitrateKbps : null,
    });

    return toSafeAccount(account);
  }

  private async resolveMediaTitles(
    mediaIds: readonly string[],
  ): Promise<Map<string, string>> {
    const uniqueMediaIds = Array.from(
      new Set(
        mediaIds
          .map((mediaId) => mediaId.trim())
          .filter((mediaId) => mediaId.length > 0),
      ),
    );

    const results = await Promise.all(
      uniqueMediaIds.map(async (mediaId) => {
        try {
          const media = await this.mediaService.getById(mediaId);
          return [mediaId, media.title] as const;
        } catch {
          return [mediaId, mediaId] as const;
        }
      }),
    );

    return new Map(results);
  }

  private async requireAccount(userId: string): Promise<AccountRecord> {
    const account = await this.accountsStore.findById(userId);
    if (!account) {
      throw new UnauthorizedException('Account not found.');
    }

    return account;
  }
}
