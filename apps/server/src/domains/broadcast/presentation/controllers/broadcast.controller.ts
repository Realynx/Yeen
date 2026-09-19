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
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Readable } from 'node:stream';
import type { BroadcastViewerClientType } from '@yeen/shared-contracts';
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
  buildPublicDirectRootManifest,
  buildPublicDirectLiveManifest,
  buildPublicDirectLiveSubtitleManifest,
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
import { BroadcastDirectStreamTimeline } from '../../application/services/broadcast-direct-stream-timeline.service';

@Controller('broadcast')
export class BroadcastController {
  constructor(
    private readonly broadcastService: BroadcastService,
    private readonly streamService: StreamService,
    private readonly subtitleListingService: SubtitleListingService,
    private readonly subtitleFileStreamService: SubtitleFileStreamService,
    private readonly directStreamTimeline: BroadcastDirectStreamTimeline,
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
    if (!(status.enabled && status.mediaId)) {
      sendServiceUnavailable(response, 'Broadcast stream is not active.');
      return;
    }

    const sessionId =
      await this.broadcastService.resolvePublicDirectHlsSessionId(
        shareToken,
        String(status.sourceEpoch),
      );
    this.trackViewerRequest(shareToken, 'vlc', request, response);
    const requestBaseUrl = resolveRequestBaseUrl(request);
    return this.streamService.streamHlsFile(
      sessionId,
      'master.m3u8',
      response,
      undefined,
      (manifest) =>
        buildPublicDirectRootManifest(
          manifest,
          status,
          requestBaseUrl,
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
    if (sourceEpoch.trim().toLowerCase() === 'live') {
      return this.getPublicDirectLiveSubtitleManifest(
        shareToken,
        request,
        response,
      );
    }

    const status = await this.broadcastService.getPublicStatus(shareToken);
    const subtitleUrl = await this.resolveDirectSubtitleUrl(status);
    const requestedSourceEpoch = parseSourceEpoch(sourceEpoch);

    if (
      !(status.enabled && status.mediaId && subtitleUrl) ||
      requestedSourceEpoch === null ||
      requestedSourceEpoch !== status.sourceEpoch
    ) {
      if (
        requestedSourceEpoch !== null &&
        status.enabled &&
        status.mediaId &&
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
      sessionId = await this.broadcastService.resolvePublicDirectHlsSessionId(
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
    this.trackViewerRequest(shareToken, 'vlc', request, response);

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
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.streamPublicDirectHlsFile(
      shareToken,
      sourceEpoch,
      fileName,
      request,
      response,
    );
  }

  @Sse('public/:shareToken/events')
  observePublicStatus(@Param('shareToken') shareToken: string) {
    return this.broadcastService.observePublicStatus(shareToken);
  }

  @Get('public/:shareToken/direct/live/subtitles.m3u8')
  async getPublicDirectLiveSubtitleManifest(
    @Param('shareToken') shareToken: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const status = await this.broadcastService.getPublicStatus(shareToken);
    const subtitleUrl = await this.resolveDirectSubtitleUrl(status);
    if (!(status.enabled && status.mediaId && subtitleUrl)) {
      sendServiceUnavailable(response, 'Broadcast subtitles are not active.');
      return;
    }

    await this.broadcastService.resolvePublicDirectHlsSessionId(
      shareToken,
      String(status.sourceEpoch),
    );
    this.trackViewerRequest(shareToken, 'vlc', request, response);
    response.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    response.setHeader('Cache-Control', 'no-store');
    response.send(
      buildPublicDirectLiveSubtitleManifest(
        subtitleUrl,
        resolveRequestBaseUrl(request),
        status.sourceEpoch,
      ),
    );
  }

  @Get('public/:shareToken/direct/live/:fileName')
  async getPublicDirectLiveHlsFile(
    @Param('shareToken') shareToken: string,
    @Param('fileName') fileName: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (fileName.trim().toLowerCase() === 'subtitles.m3u8') {
      return this.getPublicDirectLiveSubtitleManifest(
        shareToken,
        request,
        response,
      );
    }

    const status = await this.broadcastService.getPublicStatus(shareToken);
    if (!(status.enabled && status.mediaId)) {
      sendServiceUnavailable(response, 'Broadcast stream is not active.');
      return;
    }

    const sessionId =
      await this.broadcastService.resolvePublicDirectHlsSessionId(
        shareToken,
        String(status.sourceEpoch),
      );
    const stats = await this.streamService.getHlsSessionStats(sessionId);
    this.trackViewerRequest(shareToken, 'vlc', request, response, fileName);
    const window = this.directStreamTimeline.resolveWindow(
      shareToken,
      status.sourceEpoch,
      stats.segmentSeconds,
      stats.totalSegments,
      status.playbackPositionSeconds,
    );
    return this.streamService.streamHlsFile(
      sessionId,
      fileName,
      response,
      undefined,
      (manifest) =>
        buildPublicDirectLiveManifest(
          manifest,
          shareToken,
          status.sourceEpoch,
          window,
        ),
    );
  }

  @Post('public/:shareToken/heartbeat')
  updateViewerHeartbeat(
    @Param('shareToken') shareToken: string,
    @Body() dto: UpdatePublicViewerHeartbeatDto,
    @Req() request: Request,
  ) {
    return this.broadcastService.registerViewerHeartbeat(
      shareToken,
      dto.viewerId,
      resolveViewerIpAddress(request),
      request.get('user-agent'),
    );
  }

  @Get('public/:shareToken/hls/:sourceEpoch/:fileName')
  async getPublicHlsFileForEpoch(
    @Param('shareToken') shareToken: string,
    @Param('sourceEpoch') sourceEpoch: string,
    @Param('fileName') fileName: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.streamPublicHlsFile(
      shareToken,
      fileName,
      request,
      response,
      sourceEpoch,
    );
  }

  @Get('public/:shareToken/hls/:fileName')
  async getPublicHlsFile(
    @Param('shareToken') shareToken: string,
    @Param('fileName') fileName: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.streamPublicHlsFile(shareToken, fileName, request, response);
  }

  private async streamPublicHlsFile(
    shareToken: string,
    fileName: string,
    request: Request,
    response: Response,
    sourceEpoch?: string,
  ) {
    const normalizedFileName = fileName.trim();
    if (!normalizedFileName) {
      throw new BadRequestException('HLS file name is required.');
    }

    let sessionId: string;
    try {
      sessionId = await this.broadcastService.resolvePublicDirectHlsSessionId(
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

    this.trackViewerRequest(
      shareToken,
      'web',
      request,
      response,
      normalizedFileName,
    );

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
    request: Request,
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
      sessionId = await this.broadcastService.resolvePublicDirectHlsSessionId(
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

    this.trackViewerRequest(
      shareToken,
      'vlc',
      request,
      response,
      normalizedFileName,
    );

    if (/^segment_\d{5}\.ts$/.test(normalizedFileName)) {
      return this.streamService.streamHlsCompatibilitySegment(
        sessionId,
        normalizedFileName,
        response,
      );
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
      await this.broadcastService.resolvePublicDirectMediaId(shareToken);
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
      await this.broadcastService.resolvePublicDirectMediaId(shareToken);
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

  private trackViewerRequest(
    shareToken: string,
    clientType: BroadcastViewerClientType,
    request: Request,
    response: Response,
    fileName?: string,
  ): void {
    const ipAddress = resolveViewerIpAddress(request);
    const userAgent = request.get('user-agent');
    this.broadcastService.registerViewerAccess(
      shareToken,
      clientType,
      ipAddress,
      userAgent,
    );

    if (!fileName || fileName.toLowerCase().endsWith('.m3u8')) {
      return;
    }

    const startedAt = process.hrtime.bigint();
    let deliveredBytes = 0;
    let source: Readable | null = null;
    const countChunk = (chunk: unknown) => {
      if (Buffer.isBuffer(chunk)) {
        deliveredBytes += chunk.length;
      } else if (typeof chunk === 'string') {
        deliveredBytes += Buffer.byteLength(chunk);
      }
    };
    response.once('pipe', (pipedSource: Readable) => {
      source = pipedSource;
      source.on('data', countChunk);
    });
    response.once('finish', () => {
      source?.off('data', countChunk);
      const durationMs =
        Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      this.broadcastService.registerViewerDelivery(
        shareToken,
        clientType,
        ipAddress,
        userAgent,
        deliveredBytes,
        durationMs,
      );
    });
  }
}

function resolveViewerIpAddress(request: Request): string {
  const forwardedFor = request.get('x-forwarded-for')?.split(',')[0]?.trim();
  return (
    forwardedFor || request.ip || request.socket.remoteAddress || 'Unknown IP'
  );
}
