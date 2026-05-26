import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../../auth/presentation/decorators/current-user.decorator';
import type { AuthUser } from '../../../auth/domain/entities/auth-user.entity';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { SubtitleFileStreamService } from '../../../subtitle/application/services/subtitle-file-stream.service';
import { SubtitleListingService } from '../../../subtitle/application/services/subtitle-listing.service';
import { StreamService } from '../../../stream/application/services/stream.service';
import type { BroadcastPublicSessionStatus } from '../../domain/entities/broadcast-session.entity';
import { UpdateBroadcastEnabledDto } from '../../application/dto/update-broadcast-enabled.dto';
import { UpdateBroadcastPlaybackDto } from '../../application/dto/update-broadcast-playback.dto';
import { UpdateBroadcastSourceDto } from '../../application/dto/update-broadcast-source.dto';
import { UpdatePublicViewerHeartbeatDto } from '../../application/dto/update-public-viewer-heartbeat.dto';
import {
  buildPublicDirectMasterManifest,
  buildPublicDirectSubtitleManifest,
  parseSourceEpoch,
  redirectToDirectMaster,
  resolveRequestBaseUrl,
  sendServiceUnavailable,
  toPublicSubtitleUrl,
  withDirectSubtitleQuery,
} from './broadcast.controller.helpers';
import {
  BroadcastService,
  BroadcastSourceEpochMismatchError,
} from '../../application/services/broadcast.service';

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

  @Get('public/:shareToken/direct/master.m3u8')
  async getPublicDirectMasterManifest(
    @Param('shareToken') shareToken: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const status = await this.broadcastService.getPublicStatus(shareToken);
    const subtitleUrl = await this.resolveDirectSubtitleUrl(status);
    if (!(status.enabled && status.isLive && status.manifestUrl)) {
      sendServiceUnavailable(response, 'Broadcast stream is not active.');
      return;
    }

    response.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    response.setHeader('Cache-Control', 'no-store');
    response.send(
      buildPublicDirectMasterManifest(
        status,
        resolveRequestBaseUrl(request),
        subtitleUrl,
      ),
    );
  }

  @Get('public/:shareToken/direct/:sourceEpoch/subtitles.m3u8')
  async getPublicDirectSubtitleManifest(
    @Param('shareToken') shareToken: string,
    @Param('sourceEpoch') sourceEpoch: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const status = await this.broadcastService.getPublicStatus(shareToken);
    const subtitleUrl = await this.resolveDirectSubtitleUrl(status);
    const requestedSourceEpoch = parseSourceEpoch(sourceEpoch);

    if (
      !(status.enabled && status.isLive && subtitleUrl) ||
      requestedSourceEpoch === null ||
      requestedSourceEpoch !== status.sourceEpoch
    ) {
      if (
        requestedSourceEpoch !== null &&
        status.enabled &&
        status.isLive &&
        requestedSourceEpoch !== status.sourceEpoch
      ) {
        redirectToDirectMaster(response, shareToken);
        return;
      }

      sendServiceUnavailable(response, 'Broadcast subtitles are not active.');
      return;
    }

    let sessionId: string;
    try {
      sessionId = await this.broadcastService.resolvePublicHlsSessionId(
        shareToken,
        sourceEpoch,
      );
    } catch (error) {
      if (error instanceof BroadcastSourceEpochMismatchError) {
        redirectToDirectMaster(response, shareToken);
        return;
      }

      throw error;
    }

    const stats = await this.streamService.getHlsSessionStats(sessionId);

    response.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    response.setHeader('Cache-Control', 'no-store');
    response.send(
      buildPublicDirectSubtitleManifest(
        subtitleUrl,
        resolveRequestBaseUrl(request),
        stats.totalDurationSeconds,
      ),
    );
  }

  @Get('public/:shareToken/direct/hls/:sourceEpoch/:fileName')
  async getPublicDirectHlsFileForEpoch(
    @Param('shareToken') shareToken: string,
    @Param('sourceEpoch') sourceEpoch: string,
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ) {
    return this.streamPublicDirectHlsFile(
      shareToken,
      sourceEpoch,
      fileName,
      response,
    );
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

  @Get('public/:shareToken/hls/:sourceEpoch/:fileName')
  async getPublicHlsFileForEpoch(
    @Param('shareToken') shareToken: string,
    @Param('sourceEpoch') sourceEpoch: string,
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ) {
    return this.streamPublicHlsFile(
      shareToken,
      fileName,
      response,
      sourceEpoch,
    );
  }

  @Get('public/:shareToken/hls/:fileName')
  async getPublicHlsFile(
    @Param('shareToken') shareToken: string,
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ) {
    return this.streamPublicHlsFile(shareToken, fileName, response);
  }

  private async streamPublicHlsFile(
    shareToken: string,
    fileName: string,
    response: Response,
    sourceEpoch?: string,
  ) {
    const normalizedFileName = fileName.trim();
    if (!normalizedFileName) {
      throw new BadRequestException('HLS file name is required.');
    }

    let sessionId: string;
    try {
      sessionId = await this.broadcastService.resolvePublicHlsSessionId(
        shareToken,
        sourceEpoch,
      );
    } catch (error) {
      if (error instanceof BroadcastSourceEpochMismatchError) {
        sendServiceUnavailable(
          response,
          'Broadcast source switched. Refreshing stream.',
        );
        return;
      }

      throw error;
    }

    return this.streamService.streamHlsFile(
      sessionId,
      normalizedFileName,
      response,
    );
  }

  private async streamPublicDirectHlsFile(
    shareToken: string,
    sourceEpoch: string,
    fileName: string,
    response: Response,
  ) {
    const normalizedSourceEpoch = parseSourceEpoch(sourceEpoch);
    if (normalizedSourceEpoch === null) {
      throw new BadRequestException('Source epoch is required.');
    }

    const normalizedFileName = fileName.trim();
    if (!normalizedFileName) {
      throw new BadRequestException('HLS file name is required.');
    }

    let sessionId: string;
    try {
      sessionId = await this.broadcastService.resolvePublicHlsSessionId(
        shareToken,
        String(normalizedSourceEpoch),
      );
    } catch (error) {
      if (error instanceof BroadcastSourceEpochMismatchError) {
        redirectToDirectMaster(response, shareToken);
        return;
      }

      throw error;
    }

    return this.streamService.streamHlsFile(
      sessionId,
      normalizedFileName,
      response,
    );
  }

  @Get('public/:shareToken/subtitles')
  async listPublicSubtitles(@Param('shareToken') shareToken: string) {
    const mediaId =
      await this.broadcastService.resolvePublicMediaId(shareToken);
    const listed = await this.subtitleListingService.list(mediaId, null);

    return {
      tracks: listed.tracks.map((track) => ({
        ...track,
        url: toPublicSubtitleUrl(track.url, shareToken),
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

    const mediaId =
      await this.broadcastService.resolvePublicMediaId(shareToken);
    const stream = this.subtitleFileStreamService.getSubtitleFile(
      mediaId,
      normalizedFileName,
    );

    response.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    stream.pipe(response);
  }

  private async resolveDirectSubtitleUrl(
    status: BroadcastPublicSessionStatus,
  ): Promise<string | null> {
    if (status.subtitleUrl) {
      return withDirectSubtitleQuery(status.subtitleUrl, status);
    }

    if (!status.mediaId) {
      return null;
    }

    const listed = await this.subtitleListingService.list(status.mediaId, null);
    for (const track of listed.tracks) {
      const publicUrl = toPublicSubtitleUrl(track.url, status.shareToken);
      if (publicUrl) {
        return withDirectSubtitleQuery(publicUrl, status);
      }
    }

    return null;
  }
}
