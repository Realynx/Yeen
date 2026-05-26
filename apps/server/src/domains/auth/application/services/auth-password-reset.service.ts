import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import { AccountsStore } from '../../infrastructure/stores/accounts.store';
import { ConfirmPasswordResetDto } from '../dto/confirm-password-reset.dto';
import { RequestPasswordResetDto } from '../dto/request-password-reset.dto';

@Injectable()
export class AuthPasswordResetService {
  private static readonly TOKEN_TTL_MS = 60 * 60 * 1000;
  private readonly logger = new Logger(AuthPasswordResetService.name);
  private readonly tokens = new Map<
    string,
    { accountId: string; expiresAtMs: number }
  >();

  constructor(private readonly accountsStore: AccountsStore) {}

  async requestPasswordReset(dto: RequestPasswordResetDto) {
    this.pruneExpiredTokens();

    const email = dto.email.trim().toLowerCase();
    const account = await this.accountsStore.findByEmail(email);
    const response = {
      message:
        'If that account exists, a password reset link has been generated.',
      resetPath: null as string | null,
      expiresAt: null as string | null,
    };

    if (!account) {
      return response;
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAtMs = Date.now() + AuthPasswordResetService.TOKEN_TTL_MS;
    this.tokens.set(tokenHash, {
      accountId: account.id,
      expiresAtMs,
    });

    const resetPath = `/reset-password/${encodeURIComponent(token)}`;
    this.logger.log(
      `Password reset requested for ${email}. Reset path: ${resetPath}`,
    );

    return {
      ...response,
      resetPath,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  async confirmPasswordReset(dto: ConfirmPasswordResetDto) {
    this.pruneExpiredTokens();

    const tokenHash = this.hashToken(dto.token.trim());
    const record = this.tokens.get(tokenHash);
    if (!record || record.expiresAtMs <= Date.now()) {
      this.tokens.delete(tokenHash);
      throw new BadRequestException('Reset link is invalid or expired.');
    }

    const account = await this.accountsStore.findById(record.accountId);
    if (!account) {
      this.tokens.delete(tokenHash);
      throw new BadRequestException('Reset link is invalid or expired.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const updated = await this.accountsStore.updateById(account.id, {
      passwordHash,
    });

    this.tokens.delete(tokenHash);

    if (!updated) {
      throw new BadRequestException('Reset link is invalid or expired.');
    }

    return { message: 'Password reset successfully. You can sign in now.' };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private pruneExpiredTokens(): void {
    const now = Date.now();
    for (const [tokenHash, record] of this.tokens.entries()) {
      if (record.expiresAtMs <= now) {
        this.tokens.delete(tokenHash);
      }
    }
  }
}
