import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { AccountsStore } from '../../infrastructure/stores/accounts.store';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { ClaimTvPairingCodeDto } from '../dto/claim-tv-pairing-code.dto';
import { CreateAdminAccountDto } from '../dto/create-admin-account.dto';
import { LoginDto } from '../dto/login.dto';
import { PollTvPairingDto } from '../dto/poll-tv-pairing.dto';
import { RequestTvPairingDto } from '../dto/request-tv-pairing.dto';
import { ResetAccountPasswordDto } from '../dto/reset-account-password.dto';
import { RegisterDto } from '../dto/register.dto';
import { UpdateAdminAccountProfileDto } from '../dto/update-admin-account-profile.dto';
import { UpdateAccountInvitesDto } from '../dto/update-account-invites.dto';
import { UpdateAccountMaxBitrateDto } from '../dto/update-account-max-bitrate.dto';
import { UpdateAccountRoleDto } from '../dto/update-account-role.dto';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { AccountInviteRecord } from '../../domain/entities/account-invite-record.entity';
import { AccountRecord } from '../../domain/entities/account-record.entity';
import { AuthUser } from '../../domain/entities/auth-user.entity';
import { TvPairingRecord } from '../../domain/entities/tv-pairing-record.entity';
import { InviteTokensStore } from '../../infrastructure/stores/invite-tokens.store';
import { TvPairingsStore } from '../../infrastructure/stores/tv-pairings.store';
import { AuthAdminAccountService } from './auth-admin-account.service';
import { toSafeAccount } from '../helpers/auth-account-helpers';

interface UploadedAvatarImage {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private static readonly MAX_AVATAR_BYTES = 2 * 1024 * 1024;
  private static readonly TV_PAIRING_CODE_LENGTH = 6;
  private static readonly TV_PAIRING_CODE_ALPHABET =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  private static readonly TV_PAIRING_EXPIRES_MS = 10 * 60 * 1000;
  private static readonly TV_PAIRING_POLL_INTERVAL_SECONDS = 2;
  private static readonly TV_PAIRING_POLL_TIMEOUT_SECONDS = 120;
  private static readonly TV_PAIRING_RATE_LIMIT_WINDOW_MS = 60 * 1000;
  private static readonly TV_PAIRING_RATE_LIMIT_MAX_ATTEMPTS = 8;
  private static readonly ALLOWED_AVATAR_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);
  private readonly tvPairingStartAttempts = new Map<string, number[]>();

  constructor(
    private readonly accountsStore: AccountsStore,
    private readonly inviteTokensStore: InviteTokensStore,
    private readonly tvPairingsStore: TvPairingsStore,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly authAdminAccountService: AuthAdminAccountService,
  ) {}

  async onModuleInit() {
    await this.ensureDefaultAdmin();
  }

  async register(dto: RegisterDto) {
    const invite = await this.requireUnusedInvite(dto.inviteToken);
    const inviter = await this.accountsStore.findById(invite.inviterAccountId);
    if (!inviter) {
      throw new BadRequestException('Invite link is no longer valid.');
    }

    const existing = await this.accountsStore.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const account = await this.accountsStore.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
      role: 'user',
      invitedByAccountId: inviter.id,
    });

    await this.inviteTokensStore.markUsed(invite.token, account.id);

    return this.buildAuthResponse(account);
  }

  async getInviteStatus(token: string) {
    const invite = await this.requireUnusedInvite(token);
    const inviter = await this.accountsStore.findById(invite.inviterAccountId);

    if (!inviter) {
      throw new BadRequestException('Invite link is no longer valid.');
    }

    return {
      token: invite.token,
      inviterName: inviter.name,
      createdAt: invite.createdAt,
    };
  }

  async createInvite(user: AuthUser) {
    let inviter = await this.requireAccount(user.sub);

    if (inviter.role !== 'admin') {
      const remaining = inviter.invitesRemaining ?? 0;
      if (remaining <= 0) {
        throw new BadRequestException(
          'You do not have any invites available. Ask an admin for more invites.',
        );
      }

      const updatedInviter = await this.accountsStore.updateById(inviter.id, {
        invitesRemaining: remaining - 1,
      });

      if (!updatedInviter) {
        throw new UnauthorizedException('Account not found.');
      }

      inviter = updatedInviter;
    }

    const token = await this.generateUniqueInviteToken();
    const invite = await this.inviteTokensStore.create({
      token,
      inviterAccountId: inviter.id,
    });

    return {
      token: invite.token,
      invitePath: `/invite/${encodeURIComponent(invite.token)}`,
      createdAt: invite.createdAt,
      remainingInvites:
        inviter.role === 'admin' ? null : (inviter.invitesRemaining ?? 0),
    };
  }

  async listAccountsForAdmin() {
    return this.authAdminAccountService.listAccountsForAdmin();
  }

  async listAccountsActivityForAdmin() {
    return this.authAdminAccountService.listAccountsActivityForAdmin();
  }

  async setAccountInvites(accountId: string, dto: UpdateAccountInvitesDto) {
    return this.authAdminAccountService.setAccountInvites(accountId, dto);
  }

  async setAccountProfile(
    accountId: string,
    dto: UpdateAdminAccountProfileDto,
  ) {
    return this.authAdminAccountService.setAccountProfile(accountId, dto);
  }

  async resetAccountPassword(accountId: string, dto: ResetAccountPasswordDto) {
    return this.authAdminAccountService.resetAccountPassword(accountId, dto);
  }

  async setAccountRole(accountId: string, dto: UpdateAccountRoleDto) {
    return this.authAdminAccountService.setAccountRole(accountId, dto);
  }

  async setAccountMaxBitrate(
    accountId: string,
    dto: UpdateAccountMaxBitrateDto,
  ) {
    return this.authAdminAccountService.setAccountMaxBitrate(accountId, dto);
  }

  async createAccountAsAdmin(dto: CreateAdminAccountDto) {
    return this.authAdminAccountService.createAccountAsAdmin(dto);
  }

  async login(dto: LoginDto) {
    const account = await this.accountsStore.findByEmail(dto.email);
    if (!account) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const matches = await bcrypt.compare(dto.password, account.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    return this.buildAuthResponse(account);
  }

  async requestTvPairing(dto: RequestTvPairingDto) {
    await this.tvPairingsStore.removeStaleRecords();

    const clientId = this.normalizeOptionalText(dto.clientId, 128);
    const deviceName = this.normalizeOptionalText(dto.deviceName, 64);
    const devicePlatform = this.normalizeOptionalText(dto.devicePlatform, 160);

    this.enforceTvPairingStartRateLimit(clientId ?? 'anonymous');

    const createdAt = new Date();
    const expiresAt = new Date(
      createdAt.getTime() + AuthService.TV_PAIRING_EXPIRES_MS,
    );

    const pairing = await this.tvPairingsStore.create({
      code: await this.generateUniqueTvPairingCode(),
      pollToken: randomBytes(24).toString('base64url'),
      clientId,
      deviceName,
      devicePlatform,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return {
      pairingId: pairing.id,
      code: pairing.code,
      pollToken: pairing.pollToken,
      expiresAt: pairing.expiresAt,
      pollIntervalSeconds: AuthService.TV_PAIRING_POLL_INTERVAL_SECONDS,
      pollTimeoutSeconds: AuthService.TV_PAIRING_POLL_TIMEOUT_SECONDS,
    };
  }

  async claimTvPairingCode(user: AuthUser, dto: ClaimTvPairingCodeDto) {
    await this.tvPairingsStore.removeStaleRecords();

    const account = await this.requireAccount(user.sub);
    const normalizedCode = this.normalizeTvPairingCode(dto.code);
    if (!normalizedCode) {
      throw new BadRequestException('Pairing code is invalid.');
    }

    const pairing = await this.tvPairingsStore.findByCode(normalizedCode);
    if (!pairing) {
      throw new BadRequestException('Pairing code is invalid.');
    }

    if (pairing.consumedAt) {
      throw new BadRequestException('Pairing code has already been used.');
    }

    if (this.isTvPairingExpired(pairing)) {
      throw new BadRequestException(
        'Pairing code has expired. Request a new code on your TV.',
      );
    }

    if (pairing.claimedByAccountId && pairing.claimedByAccountId !== account.id) {
      throw new ConflictException(
        'Pairing code has already been approved for another account.',
      );
    }

    if (pairing.claimedAt && pairing.claimedByAccountId === account.id) {
      return {
        pairingId: pairing.id,
        code: pairing.code,
        status: 'claimed' as const,
        claimedAt: pairing.claimedAt,
        expiresAt: pairing.expiresAt,
      };
    }

    const claimedAt = new Date().toISOString();
    const updated = await this.tvPairingsStore.updateById(pairing.id, {
      claimedAt,
      claimedByAccountId: account.id,
    });

    if (!updated) {
      throw new BadRequestException('Pairing request no longer exists.');
    }

    return {
      pairingId: updated.id,
      code: updated.code,
      status: 'claimed' as const,
      claimedAt: updated.claimedAt ?? claimedAt,
      expiresAt: updated.expiresAt,
    };
  }

  async pollTvPairingStatus(pairingId: string, dto: PollTvPairingDto) {
    await this.tvPairingsStore.removeStaleRecords();

    const normalizedPairingId = pairingId.trim();
    if (!normalizedPairingId) {
      throw new BadRequestException('Pairing request is invalid.');
    }

    const pairing = await this.tvPairingsStore.findById(normalizedPairingId);
    if (!pairing) {
      throw new BadRequestException('Pairing request is invalid.');
    }

    const pollToken = dto.pollToken.trim();
    if (!pollToken || pollToken !== pairing.pollToken) {
      throw new UnauthorizedException('Pairing token is invalid.');
    }

    if (pairing.consumedAt) {
      return this.buildTvPairingPollResponse(
        pairing,
        'consumed',
        'Pairing has already completed. Request a new code on your TV.',
      );
    }

    if (this.isTvPairingExpired(pairing)) {
      return this.buildTvPairingPollResponse(
        pairing,
        'expired',
        'Pairing code has expired. Request a new code on your TV.',
      );
    }

    if (!pairing.claimedAt || !pairing.claimedByAccountId) {
      return this.buildTvPairingPollResponse(pairing, 'pending');
    }

    const consumedPairing = await this.tvPairingsStore.consumeIfClaimed(
      pairing.id,
      new Date().toISOString(),
    );

    if (!consumedPairing) {
      const refreshed = await this.tvPairingsStore.findById(pairing.id);
      if (!refreshed) {
        return this.buildTvPairingPollResponse(
          pairing,
          'denied',
          'Pairing request is no longer available.',
        );
      }

      if (refreshed.consumedAt) {
        return this.buildTvPairingPollResponse(
          refreshed,
          'consumed',
          'Pairing has already completed. Request a new code on your TV.',
        );
      }

      if (this.isTvPairingExpired(refreshed)) {
        return this.buildTvPairingPollResponse(
          refreshed,
          'expired',
          'Pairing code has expired. Request a new code on your TV.',
        );
      }

      return this.buildTvPairingPollResponse(refreshed, 'pending');
    }

    const accountId = consumedPairing.claimedByAccountId;
    if (!accountId) {
      return this.buildTvPairingPollResponse(
        consumedPairing,
        'denied',
        'Pairing approval is invalid.',
      );
    }

    const account = await this.accountsStore.findById(accountId);
    if (!account) {
      return this.buildTvPairingPollResponse(
        consumedPairing,
        'denied',
        'Pairing approval is invalid.',
      );
    }

    const auth = await this.buildAuthResponse(account);

    return {
      ...this.buildTvPairingPollResponse(consumedPairing, 'approved'),
      auth,
    };
  }

  async me(user: AuthUser) {
    const account = await this.requireAccount(user.sub);

    return toSafeAccount(account);
  }

  async updateProfile(user: AuthUser, dto: UpdateProfileDto) {
    const account = await this.requireAccount(user.sub);
    const nextEmail = dto.email.trim().toLowerCase();
    const nextName = dto.name.trim();

    if (nextEmail !== account.email) {
      const existing = await this.accountsStore.findByEmail(nextEmail);
      if (existing && existing.id !== account.id) {
        throw new ConflictException('Email is already registered.');
      }
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

  async changePassword(user: AuthUser, dto: ChangePasswordDto) {
    const account = await this.requireAccount(user.sub);
    const currentPassword = dto.currentPassword;
    const newPassword = dto.newPassword;

    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'New password must be different from your current password.',
      );
    }

    const matches = await bcrypt.compare(currentPassword, account.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const updated = await this.accountsStore.updateById(account.id, {
      passwordHash,
    });

    if (!updated) {
      throw new UnauthorizedException('Account not found.');
    }

    return { message: 'Password updated successfully.' };
  }

  async uploadAvatar(user: AuthUser, image: UploadedAvatarImage | undefined) {
    if (!image) {
      throw new BadRequestException('Please choose an image file to upload.');
    }

    const account = await this.requireAccount(user.sub);
    const mimeType = image.mimetype.trim().toLowerCase();

    if (!AuthService.ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        'Profile picture must be a PNG, JPEG, WEBP, or GIF image.',
      );
    }

    if (!Buffer.isBuffer(image.buffer) || image.buffer.length === 0) {
      throw new BadRequestException('Uploaded image is empty.');
    }

    if (image.buffer.length > AuthService.MAX_AVATAR_BYTES) {
      throw new BadRequestException('Profile picture must be 2 MB or smaller.');
    }

    const avatarDataUrl = `data:${mimeType};base64,${image.buffer.toString('base64')}`;
    const updated = await this.accountsStore.updateById(account.id, {
      avatarDataUrl,
    });

    if (!updated) {
      throw new UnauthorizedException('Account not found.');
    }

    return toSafeAccount(updated);
  }

  async removeAvatar(user: AuthUser) {
    const account = await this.requireAccount(user.sub);
    const updated = await this.accountsStore.updateById(account.id, {
      avatarDataUrl: null,
    });

    if (!updated) {
      throw new UnauthorizedException('Account not found.');
    }

    return toSafeAccount(updated);
  }

  private async buildAuthResponse(account: AccountRecord) {
    const payload: AuthUser = {
      sub: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      user: toSafeAccount(account),
    };
  }

  private async requireAccount(userId: string): Promise<AccountRecord> {
    const account = await this.accountsStore.findById(userId);
    if (!account) {
      throw new UnauthorizedException('Account not found.');
    }

    return account;
  }

  private async ensureDefaultAdmin() {
    const email = this.configService.get<string>('DEFAULT_ADMIN_EMAIL')?.trim();
    const password = this.configService
      .get<string>('DEFAULT_ADMIN_PASSWORD')
      ?.trim();
    const name =
      this.configService.get<string>('DEFAULT_ADMIN_NAME')?.trim() ||
      'Yeen Admin';

    if (!email || !password) {
      return;
    }

    const existing = await this.accountsStore.findByEmail(email);
    if (existing) {
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await this.accountsStore.create({
      email,
      name,
      passwordHash,
      role: 'admin',
    });

    this.logger.log(`Seeded default admin account for ${email}.`);
  }

  private buildTvPairingPollResponse(
    pairing: TvPairingRecord,
    status: 'pending' | 'approved' | 'expired' | 'consumed' | 'denied',
    message?: string,
  ) {
    return {
      pairingId: pairing.id,
      code: pairing.code,
      status,
      expiresAt: pairing.expiresAt,
      pollIntervalSeconds: AuthService.TV_PAIRING_POLL_INTERVAL_SECONDS,
      ...(message ? { message } : {}),
    };
  }

  private enforceTvPairingStartRateLimit(key: string) {
    const now = Date.now();
    const normalizedKey = key.trim().toLowerCase() || 'anonymous';
    const recentAttempts = (
      this.tvPairingStartAttempts.get(normalizedKey) ?? []
    ).filter(
      (timestamp) =>
        now - timestamp <= AuthService.TV_PAIRING_RATE_LIMIT_WINDOW_MS,
    );

    if (
      recentAttempts.length >= AuthService.TV_PAIRING_RATE_LIMIT_MAX_ATTEMPTS
    ) {
      throw new HttpException(
        'Too many pairing requests. Please wait a moment and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recentAttempts.push(now);
    this.tvPairingStartAttempts.set(normalizedKey, recentAttempts);

    for (const [attemptKey, attempts] of this.tvPairingStartAttempts.entries()) {
      const activeAttempts = attempts.filter(
        (timestamp) =>
          now - timestamp <= AuthService.TV_PAIRING_RATE_LIMIT_WINDOW_MS,
      );

      if (activeAttempts.length === 0) {
        this.tvPairingStartAttempts.delete(attemptKey);
      } else if (activeAttempts.length !== attempts.length) {
        this.tvPairingStartAttempts.set(attemptKey, activeAttempts);
      }
    }
  }

  private isTvPairingExpired(pairing: TvPairingRecord, nowMs = Date.now()) {
    const expiresAtMs = Date.parse(pairing.expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
      return true;
    }

    return nowMs >= expiresAtMs;
  }

  private normalizeOptionalText(
    value: string | undefined,
    maxLength: number,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    return normalized.slice(0, maxLength);
  }

  private normalizeTvPairingCode(rawCode: string): string | null {
    const normalized = rawCode.replace(/[^a-z0-9]/gi, '').toUpperCase();
    return normalized.length === AuthService.TV_PAIRING_CODE_LENGTH
      ? normalized
      : null;
  }

  private async generateUniqueTvPairingCode(): Promise<string> {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const code = this.createTvPairingCode();
      const existing = await this.tvPairingsStore.findByCode(code);

      if (!existing || existing.consumedAt || this.isTvPairingExpired(existing)) {
        return code;
      }
    }

    throw new BadRequestException('Unable to generate a pairing code right now.');
  }

  private createTvPairingCode() {
    const alphabet = AuthService.TV_PAIRING_CODE_ALPHABET;
    const bytes = randomBytes(AuthService.TV_PAIRING_CODE_LENGTH);
    let output = '';

    for (let index = 0; index < AuthService.TV_PAIRING_CODE_LENGTH; index += 1) {
      output += alphabet[bytes[index] % alphabet.length];
    }

    return output;
  }

  private async requireUnusedInvite(
    rawToken: string,
  ): Promise<AccountInviteRecord> {
    const token = rawToken.trim();
    if (!token) {
      throw new BadRequestException('Invite token is required.');
    }

    const invite = await this.inviteTokensStore.findByToken(token);
    if (!invite || invite.usedAt) {
      throw new BadRequestException('Invite link is invalid or already used.');
    }

    return invite;
  }

  private async generateUniqueInviteToken(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const token = randomBytes(24).toString('base64url');
      const existing = await this.inviteTokensStore.findByToken(token);
      if (!existing) {
        return token;
      }
    }

    throw new BadRequestException(
      'Unable to generate an invite link right now.',
    );
  }
}
