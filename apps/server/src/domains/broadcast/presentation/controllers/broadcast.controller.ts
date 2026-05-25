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
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Retry-After', '2');
      response.status(503).send({
        statusCode: 503,
        message: 'Broadcast stream is not active.',
        error: 'Service Unavailable',
      });
      return;
    }

    response.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    response.setHeader('Cache-Control', 'no-store');
    response.send(
      this.buildPublicDirectMasterManifest(
        status,
        this.resolveRequestBaseUrl(request),
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
    const requestedSourceEpoch = this.parseSourceEpoch(sourceEpoch);

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
        this.redirectToDirectMaster(response, shareToken);
        return;
      }

      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Retry-After', '2');
      response.status(503).send({
        statusCode: 503,
        message: 'Broadcast subtitles are not active.',
        error: 'Service Unavailable',
      });
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
        this.redirectToDirectMaster(response, shareToken);
        return;
      }

      throw error;
    }

    const stats = await this.streamService.getHlsSessionStats(sessionId);

    response.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    response.setHeader('Cache-Control', 'no-store');
    response.send(
      this.buildPublicDirectSubtitleManifest(
        subtitleUrl,
        this.resolveRequestBaseUrl(request),
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
    return this.streamPublicHlsFile(shareToken, fileName, response, sourceEpoch);
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
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Retry-After', '2');
        response.status(503).send({
          statusCode: 503,
          message: 'Broadcast source switched. Refreshing stream.',
          error: 'Service Unavailable',
        });
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
    const normalizedSourceEpoch = this.parseSourceEpoch(sourceEpoch);
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
        this.redirectToDirectMaster(response, shareToken);
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

      if (
        parts.length < 6 ||
        parts[1] !== 'api' ||
        parts[2] !== 'subtitles' ||
        parts[3] !== 'file'
      ) {
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

  private buildPublicDirectMasterManifest(
    status: BroadcastPublicSessionStatus,
    requestBaseUrl: string,
    subtitleUrl: string | null,
  ): string {
    const lines = ['#EXTM3U', '#EXT-X-VERSION:6', '#EXT-X-INDEPENDENT-SEGMENTS'];
    const subtitleManifestUrl =
      subtitleUrl
        ? this.toManifestUri(
            `/api/broadcast/public/${encodeURIComponent(status.shareToken)}/direct/${status.sourceEpoch}/subtitles.m3u8`,
            requestBaseUrl,
          )
        : null;

    if (subtitleManifestUrl) {
      lines.push(
        `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Broadcast Subtitles",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,URI="${subtitleManifestUrl}"`,
      );
    }

    const subtitleAttribute = subtitleManifestUrl ? ',SUBTITLES="subs"' : '';
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=4000000,CLOSED-CAPTIONS=NONE${subtitleAttribute}`,
    );
    lines.push(
      this.toManifestUri(
        `/api/broadcast/public/${encodeURIComponent(status.shareToken)}/direct/hls/${status.sourceEpoch}/master.m3u8`,
        requestBaseUrl,
      ) ?? '',
    );
    lines.push('');

    return lines.join('\n');
  }

  private buildPublicDirectSubtitleManifest(
    subtitleUrl: string,
    requestBaseUrl: string,
    totalDurationSeconds: number,
  ): string {
    const resolvedSubtitleUrl = this.toManifestUri(subtitleUrl, requestBaseUrl);
    if (!resolvedSubtitleUrl) {
      return '#EXTM3U\n';
    }

    const durationSeconds =
      Number.isFinite(totalDurationSeconds) && totalDurationSeconds > 0
        ? totalDurationSeconds
        : 1;
    const targetDuration = Math.max(1, Math.ceil(durationSeconds));

    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:6',
      `#EXT-X-TARGETDURATION:${targetDuration}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      `#EXTINF:${durationSeconds.toFixed(3)},`,
      resolvedSubtitleUrl,
      '#EXT-X-ENDLIST',
      '',
    ];

    return lines.join('\n');
  }

  private async resolveDirectSubtitleUrl(
    status: BroadcastPublicSessionStatus,
  ): Promise<string | null> {
    if (status.subtitleUrl) {
      return this.withDirectSubtitleQuery(status.subtitleUrl, status);
    }

    if (!status.mediaId) {
      return null;
    }

    const listed = await this.subtitleListingService.list(status.mediaId, null);
    for (const track of listed.tracks) {
      const publicUrl = this.toPublicSubtitleUrl(track.url, status.shareToken);
      if (publicUrl) {
        return this.withDirectSubtitleQuery(publicUrl, status);
      }
    }

    return null;
  }

  private withDirectSubtitleQuery(
    pathOrUrl: string,
    status: BroadcastPublicSessionStatus,
  ): string {
    try {
      const parsed = new URL(pathOrUrl, 'http://localhost');
      parsed.searchParams.set('sourceEpoch', String(status.sourceEpoch));
      if (status.streamKey) {
        parsed.searchParams.set('stream', status.streamKey);
      }

      return /^https?:\/\//i.test(pathOrUrl)
        ? parsed.toString()
        : `${parsed.pathname}${parsed.search}`;
    } catch {
      const params = new URLSearchParams();
      params.set('sourceEpoch', String(status.sourceEpoch));
      if (status.streamKey) {
        params.set('stream', status.streamKey);
      }

      const separator = pathOrUrl.includes('?') ? '&' : '?';
      return `${pathOrUrl}${separator}${params.toString()}`;
    }
  }

  private resolveRequestBaseUrl(request: Request): string {
    const forwardedProto = request.header('x-forwarded-proto')?.split(',')[0]?.trim();
    const forwardedHost = request.header('x-forwarded-host')?.split(',')[0]?.trim();
    const protocol = forwardedProto || request.protocol || 'http';
    const host = forwardedHost || request.get('host') || '';

    return host ? `${protocol}://${host}` : '';
  }

  private parseSourceEpoch(value: string): number | null {
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }

  private redirectToDirectMaster(
    response: Response,
    shareToken: string,
  ): void {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader(
      'Location',
      `/api/broadcast/public/${encodeURIComponent(shareToken)}/direct/master.m3u8`,
    );
    response.status(307).send();
  }

  private toManifestUri(
    pathOrUrl: string | null,
    requestBaseUrl = '',
  ): string | null {
    if (!pathOrUrl) {
      return null;
    }

    const resolved =
      !/^https?:\/\//i.test(pathOrUrl) && pathOrUrl.startsWith('/') && requestBaseUrl
        ? `${requestBaseUrl}${pathOrUrl}`
        : pathOrUrl;

    return resolved.replace(/"/g, '%22');
  }
}
