import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../../auth/presentation/decorators/current-user.decorator';
import type { AuthUser } from '../../../auth/domain/entities/auth-user.entity';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { SubtitleFileStreamService } from '../../../subtitle/application/services/subtitle-file-stream.service';
import { SubtitleListingService } from '../../../subtitle/application/services/subtitle-listing.service';
import { StreamService } from '../../../stream/application/services/stream.service';
import { UpdateBroadcastEnabledDto } from '../../application/dto/update-broadcast-enabled.dto';
import { UpdateBroadcastPlaybackDto } from '../../application/dto/update-broadcast-playback.dto';
import { UpdateBroadcastSourceDto } from '../../application/dto/update-broadcast-source.dto';
import { UpdatePublicViewerHeartbeatDto } from '../../application/dto/update-public-viewer-heartbeat.dto';
import { BroadcastService } from '../../application/services/broadcast.service';

@Controller('broadcast')
export class BroadcastController {
  constructor(
    private readonly broadcastService: BroadcastService,
    private readonly streamService: StreamService,
    private readonly subtitleListingService: SubtitleListingService,
    private readonly subtitleFileStreamService: SubtitleFileStreamService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('session')
  getOwnerSession(@CurrentUser() user: AuthUser) {
    return this.broadcastService.getOwnerStatus(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Put('enabled')
  setEnabled(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateBroadcastEnabledDto,
  ) {
    return this.broadcastService.setEnabled(user.sub, dto.enabled);
  }

  @UseGuards(JwtAuthGuard)
  @Put('source')
  updateSource(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateBroadcastSourceDto,
  ) {
    return this.broadcastService.updateSource(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('playback')
  updatePlayback(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateBroadcastPlaybackDto,
  ) {
    return this.broadcastService.updatePlayback(user.sub, dto);
  }

  @Get('public/:shareToken')
  getPublicStatus(@Param('shareToken') shareToken: string) {
    return this.broadcastService.getPublicStatus(shareToken);
  }

  @Post('public/:shareToken/heartbeat')
  updateViewerHeartbeat(
    @Param('shareToken') shareToken: string,
    @Body() dto: UpdatePublicViewerHeartbeatDto,
  ) {
    return this.broadcastService.registerViewerHeartbeat(
      shareToken,
      dto.viewerId,
    );
  }

  @Get('public/:shareToken/hls/:fileName')
  async getPublicHlsFile(
    @Param('shareToken') shareToken: string,
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ) {
    const normalizedFileName = fileName.trim();
    if (!normalizedFileName) {
      throw new BadRequestException('HLS file name is required.');
    }

    const sessionId =
      await this.broadcastService.resolvePublicHlsSessionId(shareToken);

    return this.streamService.streamHlsFile(
      sessionId,
      normalizedFileName,
      response,
    );
  }

  @Get('public/:shareToken/subtitles')
  async listPublicSubtitles(@Param('shareToken') shareToken: string) {
    const mediaId = await this.broadcastService.resolvePublicMediaId(shareToken);
    const listed = await this.subtitleListingService.list(mediaId, null);

    return {
      tracks: listed.tracks.map((track) => ({
        ...track,
        url: this.toPublicSubtitleUrl(track.url, shareToken),
      })),
    };
  }

  @Get('public/:shareToken/subtitles/:fileName')
  async getPublicSubtitleFile(
    @Param('shareToken') shareToken: string,
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ) {
    const normalizedFileName = fileName.trim();
    if (!normalizedFileName) {
      throw new BadRequestException('Subtitle file name is required.');
    }

    const mediaId = await this.broadcastService.resolvePublicMediaId(shareToken);
    const stream = this.subtitleFileStreamService.getSubtitleFile(
      mediaId,
      normalizedFileName,
    );

    response.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    stream.pipe(response);
  }

  private toPublicSubtitleUrl(
    trackUrl: string | null,
    shareToken: string,
  ): string | null {
    if (!trackUrl) {
      return null;
    }

    try {
      const parsed = new URL(trackUrl, 'http://localhost');
      const parts = parsed.pathname.split('/');

      if (parts.length < 6 || parts[1] !== 'api' || parts[2] !== 'subtitles' || parts[3] !== 'file') {
        return trackUrl;
      }

      const fileName = parts.slice(5).join('/');
      if (!fileName) {
        return trackUrl;
      }

      return `/api/broadcast/public/${encodeURIComponent(shareToken)}/subtitles/${fileName}`;
    } catch {
      return trackUrl;
    }
  }
}
