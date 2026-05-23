import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { StreamService } from '../../application/services/stream.service';

@UseGuards(JwtAuthGuard)
@Controller('stream')
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @Post(':mediaId/hls/start')
  async startHls(
    @Param('mediaId') mediaId: string,
    @Req() request: Request,
    @Query('force') force?: string,
    @Query('audioStreamIndex') audioStreamIndex?: string,
  ) {
    const forceFresh = force === '1' || force === 'true';
    const started = await this.streamService.startHls(mediaId, {
      forceFresh,
      audioStreamIndex: this.parseAudioStreamIndex(audioStreamIndex),
    });
    const accessToken = this.extractAccessToken(request);

    if (!accessToken) {
      return started;
    }

    return {
      ...started,
      manifestUrl: this.withAccessToken(started.manifestUrl, accessToken),
    };
  }

  @Get('hls/:sessionId/debug/stats')
  getHlsSessionStats(@Param('sessionId') sessionId: string) {
    return this.streamService.getHlsSessionStats(sessionId);
  }

  @Get(':mediaId/audio-tracks')
  getAudioTracks(@Param('mediaId') mediaId: string) {
    return this.streamService.listAudioTracks(mediaId);
  }

  @Get('hls/:sessionId/:fileName')
  getHlsFile(
    @Param('sessionId') sessionId: string,
    @Param('fileName') fileName: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const accessToken = this.extractAccessToken(request);

    return this.streamService.streamHlsFile(
      sessionId,
      fileName,
      response,
      accessToken,
    );
  }

  @Get(':mediaId/direct')
  getDirect(
    @Param('mediaId') mediaId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.streamService.streamDirect(mediaId, request, response);
  }

  private extractAccessToken(request: Request): string | undefined {
    const queryToken =
      typeof request.query.access_token === 'string'
        ? request.query.access_token.trim()
        : '';

    if (queryToken) {
      return queryToken;
    }

    const header = request.headers.authorization;
    if (typeof header !== 'string') {
      return undefined;
    }

    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return undefined;
    }

    const token = match[1].trim();
    return token || undefined;
  }

  private withAccessToken(url: string, token: string): string {
    const absolutePattern = /^https?:\/\//i;

    try {
      const parsed = new URL(url, 'http://local.yeen');
      parsed.searchParams.set('access_token', token);

      if (absolutePattern.test(url)) {
        return parsed.toString();
      }

      return `${parsed.pathname}${parsed.search}`;
    } catch {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}access_token=${encodeURIComponent(token)}`;
    }
  }

  private parseAudioStreamIndex(value: string | undefined): number | null {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BadRequestException(
        'audioStreamIndex must be a non-negative integer.',
      );
    }

    return parsed;
  }
}
