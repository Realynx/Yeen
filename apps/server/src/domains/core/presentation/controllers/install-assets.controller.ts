import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Controller, Get, NotFoundException, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

const DEFAULT_TV_APK_PATH = resolve('artifacts/tv/yeen-tv.apk');

@Controller('install')
export class InstallAssetsController {
  constructor(private readonly configService: ConfigService) {}

  @Get('android-tv-apk')
  async getAndroidTvApk(@Res() response: Response): Promise<void> {
    const filePath = this.resolveApkFilePath();
    if (!filePath) {
      throw new NotFoundException('TV APK download is not configured.');
    }

    let fileStats;
    try {
      fileStats = await stat(filePath);
    } catch {
      throw new NotFoundException('TV APK file is unavailable.');
    }

    if (!fileStats.isFile()) {
      throw new NotFoundException('TV APK file is unavailable.');
    }

    response
      .setHeader('Content-Type', 'application/vnd.android.package-archive')
      .setHeader('Content-Disposition', 'attachment; filename="yeen-tv.apk"')
      .setHeader('Cache-Control', 'no-store')
      .setHeader('Content-Length', String(fileStats.size))
      .sendFile(filePath);
  }

  private resolveApkFilePath(): string | null {
    const configuredPath =
      this.configService.get<string>('TV_APK_FILE_PATH')?.trim() ?? '';

    if (configuredPath) {
      return resolve(configuredPath);
    }

    return DEFAULT_TV_APK_PATH;
  }
}
