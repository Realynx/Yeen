import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { AccountsStore } from './accounts.store';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateAdminAccountDto } from './dto/create-admin-account.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateAccountInvitesDto } from './dto/update-account-invites.dto';
import { UpdateAccountRoleDto } from './dto/update-account-role.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AccountInviteRecord } from './entities/account-invite-record.entity';
import { AccountRecord } from './entities/account-record.entity';
import { AuthUser } from './entities/auth-user.entity';
import { InviteTokensStore } from './invite-tokens.store';

interface UploadedAvatarImage {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private static readonly MAX_AVATAR_BYTES = 2 * 1024 * 1024;
  private static readonly ALLOWED_AVATAR_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);

  constructor(
    private readonly accountsStore: AccountsStore,
    private readonly inviteTokensStore: InviteTokensStore,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
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
    const accounts = await this.accountsStore.list();
    const accountsById = new Map(accounts.map((account) => [account.id, account]));

    const normalized = accounts
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((account) => ({
        ...this.toSafeAccount(account),
        invitedByName: account.invitedByAccountId
          ? accountsById.get(account.invitedByAccountId)?.name ?? null
          : null,
      }));

    return {
      accounts: normalized,
    };
  }

  async setAccountInvites(accountId: string, dto: UpdateAccountInvitesDto) {
    const account = await this.requireAccount(accountId);

    if (account.role === 'admin') {
      return this.toSafeAccount(account);
    }

    const updated = await this.accountsStore.updateById(account.id, {
      invitesRemaining: dto.invitesRemaining,
    });

    if (!updated) {
      throw new UnauthorizedException('Account not found.');
    }

    return this.toSafeAccount(updated);
  }

  async setAccountRole(accountId: string, dto: UpdateAccountRoleDto) {
    const account = await this.requireAccount(accountId);
    const nextRole =
      dto.role === 'admin' || dto.role === 'sailer' || dto.role === 'user'
        ? dto.role
        : 'user';

    if (account.role === nextRole) {
      return this.toSafeAccount(account);
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

    return this.toSafeAccount(updated);
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
      invitesRemaining: role === 'admin' ? null : dto.invitesRemaining ?? 0,
    });

    return this.toSafeAccount(account);
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

  async me(user: AuthUser) {
    const account = await this.requireAccount(user.sub);

    return this.toSafeAccount(account);
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

    return this.toSafeAccount(updated);
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

    return this.toSafeAccount(updated);
  }

  async removeAvatar(user: AuthUser) {
    const account = await this.requireAccount(user.sub);
    const updated = await this.accountsStore.updateById(account.id, {
      avatarDataUrl: null,
    });

    if (!updated) {
      throw new UnauthorizedException('Account not found.');
    }

    return this.toSafeAccount(updated);
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
      user: this.toSafeAccount(account),
    };
  }

  private toSafeAccount(account: AccountRecord) {
    return {
      id: account.id,
      email: account.email,
      name: account.name,
      avatarDataUrl: account.avatarDataUrl ?? null,
      role: account.role,
      invitesRemaining:
        account.role === 'admin' ? null : (account.invitesRemaining ?? 0),
      invitedByAccountId: account.invitedByAccountId ?? null,
      createdAt: account.createdAt,
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

  private async requireUnusedInvite(rawToken: string): Promise<AccountInviteRecord> {
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

    throw new BadRequestException('Unable to generate an invite link right now.');
  }
}
