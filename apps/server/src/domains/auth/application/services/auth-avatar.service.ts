import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthUser } from '../../domain/entities/auth-user.entity';
import { AccountsStore } from '../../infrastructure/stores/accounts.store';
import { toSafeAccount } from '../helpers/auth-account-helpers';

export interface UploadedAvatarImage {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class AuthAvatarService {
  private static readonly MAX_AVATAR_BYTES = 2 * 1024 * 1024;
  private static readonly ALLOWED_AVATAR_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);

  constructor(private readonly accountsStore: AccountsStore) {}

  async uploadAvatar(user: AuthUser, image: UploadedAvatarImage | undefined) {
    if (!image) {
      throw new BadRequestException('Please choose an image file to upload.');
    }

    const account = await this.requireAccount(user.sub);
    const mimeType = image.mimetype.trim().toLowerCase();

    if (!AuthAvatarService.ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(
        'Profile picture must be a PNG, JPEG, WEBP, or GIF image.',
      );
    }

    if (!Buffer.isBuffer(image.buffer) || image.buffer.length === 0) {
      throw new BadRequestException('Uploaded image is empty.');
    }

    if (image.buffer.length > AuthAvatarService.MAX_AVATAR_BYTES) {
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

  private async requireAccount(userId: string) {
    const account = await this.accountsStore.findById(userId);
    if (!account) {
      throw new UnauthorizedException('Account not found.');
    }

    return account;
  }
}
