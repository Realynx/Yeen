import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { AccountRecord } from '../../domain/entities/account-record.entity';
import { AuthUser } from '../../domain/entities/auth-user.entity';
import { TvPairingRecord } from '../../domain/entities/tv-pairing-record.entity';
import { AccountsStore } from '../../infrastructure/stores/accounts.store';
import { TvPairingsStore } from '../../infrastructure/stores/tv-pairings.store';
import { ClaimTvPairingCodeDto } from '../dto/claim-tv-pairing-code.dto';
import { PollTvPairingDto } from '../dto/poll-tv-pairing.dto';
import { RequestTvPairingDto } from '../dto/request-tv-pairing.dto';
import { toSafeAccount } from '../helpers/auth-account-helpers';

@Injectable()
export class AuthTvPairingService {
  private static readonly TV_PAIRING_CODE_LENGTH = 6;
  private static readonly TV_PAIRING_CODE_ALPHABET =
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  private static readonly TV_PAIRING_EXPIRES_MS = 10 * 60 * 1000;
  private static readonly TV_PAIRING_POLL_INTERVAL_SECONDS = 2;
  private static readonly TV_PAIRING_POLL_TIMEOUT_SECONDS = 120;
  private static readonly TV_PAIRING_RATE_LIMIT_WINDOW_MS = 60 * 1000;
  private static readonly TV_PAIRING_RATE_LIMIT_MAX_ATTEMPTS = 8;

  private readonly tvPairingStartAttempts = new Map<string, number[]>();

  constructor(
    private readonly accountsStore: AccountsStore,
    private readonly tvPairingsStore: TvPairingsStore,
    private readonly jwtService: JwtService,
  ) {}

  async requestTvPairing(dto: RequestTvPairingDto) {
    await this.tvPairingsStore.removeStaleRecords();

    const clientId = this.normalizeOptionalText(dto.clientId, 128);
    const deviceName = this.normalizeOptionalText(dto.deviceName, 64);
    const devicePlatform = this.normalizeOptionalText(dto.devicePlatform, 160);

    this.enforceTvPairingStartRateLimit(clientId ?? 'anonymous');

    const createdAt = new Date();
    const expiresAt = new Date(
      createdAt.getTime() + AuthTvPairingService.TV_PAIRING_EXPIRES_MS,
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
      pollIntervalSeconds:
        AuthTvPairingService.TV_PAIRING_POLL_INTERVAL_SECONDS,
      pollTimeoutSeconds: AuthTvPairingService.TV_PAIRING_POLL_TIMEOUT_SECONDS,
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

    if (
      pairing.claimedByAccountId &&
      pairing.claimedByAccountId !== account.id
    ) {
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
      pollIntervalSeconds:
        AuthTvPairingService.TV_PAIRING_POLL_INTERVAL_SECONDS,
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
        now - timestamp <= AuthTvPairingService.TV_PAIRING_RATE_LIMIT_WINDOW_MS,
    );

    if (
      recentAttempts.length >=
      AuthTvPairingService.TV_PAIRING_RATE_LIMIT_MAX_ATTEMPTS
    ) {
      throw new HttpException(
        'Too many pairing requests. Please wait a moment and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recentAttempts.push(now);
    this.tvPairingStartAttempts.set(normalizedKey, recentAttempts);

    for (const [
      attemptKey,
      attempts,
    ] of this.tvPairingStartAttempts.entries()) {
      const activeAttempts = attempts.filter(
        (timestamp) =>
          now - timestamp <=
          AuthTvPairingService.TV_PAIRING_RATE_LIMIT_WINDOW_MS,
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
    return normalized.length === AuthTvPairingService.TV_PAIRING_CODE_LENGTH
      ? normalized
      : null;
  }

  private async generateUniqueTvPairingCode(): Promise<string> {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const code = this.createTvPairingCode();
      const existing = await this.tvPairingsStore.findByCode(code);

      if (
        !existing ||
        existing.consumedAt ||
        this.isTvPairingExpired(existing)
      ) {
        return code;
      }
    }

    throw new BadRequestException(
      'Unable to generate a pairing code right now.',
    );
  }

  private createTvPairingCode() {
    const alphabet = AuthTvPairingService.TV_PAIRING_CODE_ALPHABET;
    const bytes = randomBytes(AuthTvPairingService.TV_PAIRING_CODE_LENGTH);
    let output = '';

    for (
      let index = 0;
      index < AuthTvPairingService.TV_PAIRING_CODE_LENGTH;
      index += 1
    ) {
      output += alphabet[bytes[index] % alphabet.length];
    }

    return output;
  }
}
