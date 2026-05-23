import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TorrentAccessGuard } from '../auth/torrent-access.guard';
import { ScanMediaDto } from './dto/scan-media.dto';
import { SetMediaLocationsDto } from './dto/set-media-locations.dto';
import {
  BulkAssignEpisodesDto,
  BulkUpdateMediaDto,
  UpdateMediaDto,
} from './dto/update-media.dto';
import { BulkDeleteMediaDto } from './dto/delete-media.dto';
import {
  CommitMetadataDto,
  PlanCommitMetadataDto,
} from './dto/commit-metadata.dto';
import { ImportMetadataDto } from './dto/import-metadata.dto';
import { DownloadIptorrentDto } from './dto/download-iptorrent.dto';
import { PurgeRecycleDeletionsDto } from './dto/purge-recycle-deletions.dto';
import { IptorrentsSearchService } from './iptorrents-search.service';
import { NyaaSearchService } from './nyaa-search.service';
import { MediaFsCommitService } from './media-fs-commit.service';
import { MediaService } from './media.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { TorrentService } from '../torrent/torrent.service';

@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly mediaFsCommitService: MediaFsCommitService,
    private readonly iptorrentsSearchService: IptorrentsSearchService,
    private readonly nyaaSearchService: NyaaSearchService,
    private readonly torrentService: TorrentService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  @Get()
  list(@Query('q') query?: string, @Query('tags') tags?: string | string[]) {
    return this.mediaService.list(query, this.parseTagsQuery(tags));
  }

  @Get('locations')
  @UseGuards(AdminGuard)
  getLocations() {
    return this.mediaService.getLocations();
  }

  @Put('locations')
  @UseGuards(AdminGuard)
  setLocations(@Body() dto: SetMediaLocationsDto) {
    return this.mediaService.setLocations(dto.locations);
  }

  @Get('scan/progress')
  @UseGuards(AdminGuard)
  getScanProgress() {
    return this.mediaService.getScanProgress();
  }

  @Post('cache/clear')
  @UseGuards(AdminGuard)
  clearApiCaches() {
    return this.mediaService.clearApiCaches();
  }

  @Post('metadata/clear')
  @UseGuards(AdminGuard)
  clearMetadataIndex() {
    return this.mediaService.clearMetadataIndex();
  }

  @Get('recycle/deletions')
  @UseGuards(AdminGuard)
  listRecycleDeletions(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : NaN;
    return this.mediaService.listRecycleDeletions(
      Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    );
  }

  @Delete('recycle/deletions')
  @UseGuards(AdminGuard)
  purgeRecycleDeletions(@Body() dto: PurgeRecycleDeletionsDto) {
    return this.mediaService.purgeRecycleDeletions(dto);
  }

  @Get('stats')
  getStats() {
    return this.mediaService.getStats();
  }

  @Post('scan')
  @UseGuards(AdminGuard)
  scan(@Body() dto: ScanMediaDto) {
    return this.mediaService.scan(dto.libraryPath, dto.libraryPaths);
  }

  @Get('search/remote')
  searchRemoteMedia(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('providers') providers?: string | string[],
    @Query('tags') tags?: string | string[],
    @Query('noCache') noCache?: string | string[],
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : NaN;
    const parsedPage = page ? Number.parseInt(page, 10) : NaN;
    return this.mediaService.searchRemoteMediaCatalog({
      query: (query ?? '').trim(),
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      page: Number.isFinite(parsedPage) ? parsedPage : undefined,
      providers: this.parseRemoteProvidersQuery(providers),
      tags: this.parseTagsQuery(tags),
      useCache: !this.parseBooleanQuery(noCache),
    });
  }

  @Get('search/iptorrents')
  @UseGuards(TorrentAccessGuard)
  searchIptorrents(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
    @Query('mediaType') mediaType?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : NaN;
    const normalizedMediaType =
      mediaType === 'movie' || mediaType === 'show' ? mediaType : undefined;

    return this.iptorrentsSearchService.search({
      query: (query ?? '').trim(),
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      mediaType: normalizedMediaType,
    });
  }

  @Get('search/nyaa')
  @UseGuards(TorrentAccessGuard)
  searchNyaa(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDirection') sortDirection?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : NaN;

    return this.nyaaSearchService.search({
      query: (query ?? '').trim(),
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      page: Number.isFinite(Number(page)) ? Number(page) : undefined,
      sortBy,
      sortDirection,
      category: typeof category === 'string' ? category.trim() : undefined,
    });
  }

  @Post('search/iptorrents/download')
  @UseGuards(TorrentAccessGuard)
  async startIptorrentsDownload(@Body() dto: DownloadIptorrentDto) {
    const intent = dto.intent === 'background' ? 'background' : 'stream';
    const systemSettings = await this.systemSettingsService.getSettings();
    const torrentFile = await this.iptorrentsSearchService.downloadTorrentFile({
      downloadUrl: dto.downloadUrl,
      fallbackFileName: dto.title,
    });

    const result = await this.torrentService.addTorrent(
      {
        savePath: dto.savePath?.trim() || undefined,
        paused: false,
        seedAfterDownload: systemSettings.iptorrentsSeedingEnabled,
        intent,
        orderMode: intent === 'stream' ? 'sequential' : undefined,
      },
      torrentFile,
    );

    if (result.hash && dto.metadataHint) {
      await this.torrentService.setKnownTorrentMediaHint(
        result.hash,
        dto.metadataHint,
      );
    }

    // Both stream and background downloads should be indexed once enough of the
    // file is on disk so the new media shows up in the library. The frontend
    // continues polling /torrent/:hash/index while this initial attempt is
    // pending.
    const indexResult = result.hash
      ? await this.mediaService.indexTorrentFile(result.hash).catch(() => null)
      : null;

    return {
      ...result,
      message:
        intent === 'stream'
          ? 'Stream torrent started in qBittorrent (sequential order).'
          : 'Torrent download started in qBittorrent.',
      indexResult,
    };
  }

  @Post('search/nyaa/download')
  @UseGuards(TorrentAccessGuard)
  async startNyaaDownload(@Body() dto: DownloadIptorrentDto) {
    const intent = dto.intent === 'background' ? 'background' : 'stream';
    const systemSettings = await this.systemSettingsService.getSettings();
    const torrentFile = await this.nyaaSearchService.downloadTorrentFile({
      downloadUrl: dto.downloadUrl,
      fallbackFileName: dto.title,
    });

    const result = await this.torrentService.addTorrent(
      {
        savePath: dto.savePath?.trim() || undefined,
        paused: false,
        seedAfterDownload: systemSettings.nyaaSeedingEnabled,
        intent,
        orderMode: intent === 'stream' ? 'sequential' : undefined,
      },
      torrentFile,
    );

    if (result.hash && dto.metadataHint) {
      await this.torrentService.setKnownTorrentMediaHint(
        result.hash,
        dto.metadataHint,
      );
    }

    const indexResult = result.hash
      ? await this.mediaService.indexTorrentFile(result.hash).catch(() => null)
      : null;

    return {
      ...result,
      message:
        intent === 'stream'
          ? 'Nyaa stream torrent started in qBittorrent (sequential order).'
          : 'Nyaa torrent download started in qBittorrent.',
      indexResult,
    };
  }

  @Post('torrent/:hash/index')
  @UseGuards(TorrentAccessGuard)
  indexTorrent(@Param('hash') hash: string) {
    return this.mediaService.indexTorrentFile(hash);
  }

  /**
   * Combined status endpoint for the "preparing to stream" page: returns both
   * the index probe result and live qBittorrent download stats in one call so
   * the page can poll a single URL.
   */
  @Get('torrent/:hash/status')
  async getTorrentStatus(@Param('hash') hash: string) {
    const [indexResult, torrent] = await Promise.all([
      this.mediaService.indexTorrentFile(hash).catch((error: unknown) => ({
        status: 'pending' as const,
        reason:
          error instanceof Error
            ? `Index attempt failed: ${error.message}`
            : 'Index attempt failed.',
      })),
      this.torrentService.getTorrentByHash(hash).catch(() => null),
    ]);

    // While the prepare page is still polling, the user is actively waiting
    // on the head of the file. Make sure the torrent is in sequential +
    // first/last-piece-priority mode so the EBML/MOV header lands ASAP.
    // This is a no-op when already in that state.
    if (indexResult.status !== 'indexed') {
      void this.torrentService.ensureSequentialDownload(hash);
    }

    return { indexResult, torrent };
  }

  @Post('torrent/download-progress')
  getTorrentDownloadProgress(@Body() body: { mediaIds?: unknown }) {
    return this.mediaService.getTorrentDownloadProgressByMediaIds(
      this.parseStringArrayBody(body?.mediaIds),
    );
  }

  @Get('remote/:remoteId')
  getRemoteById(@Param('remoteId') remoteId: string) {
    return this.mediaService.getRemoteMediaById(remoteId);
  }

  @Get(':mediaId')
  getById(@Param('mediaId') mediaId: string) {
    return this.mediaService.getById(mediaId);
  }

  @Get(':mediaId/detect')
  detectFilename(@Param('mediaId') mediaId: string) {
    return this.mediaService.detectFilenameMetadata(mediaId);
  }

  @Get(':mediaId/series-tracker')
  getSeriesEpisodeTracker(@Param('mediaId') mediaId: string) {
    return this.mediaService.getSeriesEpisodeTracker(mediaId);
  }

  @Get('metadata/search')
  @UseGuards(AdminGuard)
  searchMetadata(
    @Query('title') title?: string,
    @Query('type') type?: string,
    @Query('year') year?: string,
    @Query('limit') limit?: string,
  ) {
    const normalizedType: 'movie' | 'show' | 'other' =
      type === 'movie' || type === 'show' ? type : 'other';
    const parsedYear = year ? Number.parseInt(year, 10) : NaN;
    const parsedLimit = limit ? Number.parseInt(limit, 10) : NaN;
    return this.mediaService.searchMetadataCandidates({
      title: (title ?? '').trim(),
      type: normalizedType,
      year: Number.isFinite(parsedYear) ? parsedYear : null,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
    });
  }

  @Get('metadata/export')
  @UseGuards(AdminGuard)
  exportMetadata() {
    return this.mediaService.exportMetadata();
  }

  @Post('metadata/import')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file'))
  importMetadata(
    @Body() dto: ImportMetadataDto,
    @UploadedFile() importFile?: unknown,
  ) {
    const normalizedFile = this.normalizeUploadedJsonFile(importFile);
    if (!normalizedFile) {
      throw new BadRequestException('Metadata import file is required.');
    }

    return this.mediaService.importMetadataFromJson({
      mode: dto.mode,
      rawJson: normalizedFile.buffer.toString('utf-8'),
    });
  }

  @Patch(':mediaId')
  @UseGuards(AdminGuard)
  updateMedia(@Param('mediaId') mediaId: string, @Body() dto: UpdateMediaDto) {
    return this.mediaService.updateMedia(mediaId, dto);
  }

  @Post('bulk/assign-episodes')
  @UseGuards(AdminGuard)
  bulkAssignEpisodes(@Body() dto: BulkAssignEpisodesDto) {
    return this.mediaService.bulkAssignEpisodes(dto);
  }

  @Post('bulk/update')
  @UseGuards(AdminGuard)
  async bulkUpdate(@Body() dto: BulkUpdateMediaDto) {
    const results = [];
    for (const id of dto.mediaIds) {
      results.push(await this.mediaService.updateMedia(id, dto.patch));
    }
    return { updatedCount: results.length, items: results };
  }

  @Delete('bulk/permanent')
  @UseGuards(AdminGuard)
  bulkDeletePermanent(@Body() dto: BulkDeleteMediaDto) {
    return this.mediaService.bulkDeleteMediaPermanently(dto.mediaIds);
  }

  @Post('commit/plan')
  @UseGuards(AdminGuard)
  planCommit(@Body() dto: PlanCommitMetadataDto) {
    if (dto.mediaIds && dto.mediaIds.length > 0) {
      return this.mediaFsCommitService.planByIds(dto.mediaIds);
    }
    return this.mediaFsCommitService.planAll();
  }

  @Post('commit/apply')
  @UseGuards(AdminGuard)
  commit(@Body() dto: CommitMetadataDto) {
    return this.mediaFsCommitService.commit({
      mediaIds: dto.mediaIds,
      writeNfo: dto.writeNfo,
    });
  }

  @Get('commit/history')
  @UseGuards(AdminGuard)
  commitHistory() {
    return this.mediaFsCommitService.listCommits();
  }

  @Post('commit/rollback/:commitId')
  @UseGuards(AdminGuard)
  rollback(@Param('commitId') commitId: string) {
    return this.mediaFsCommitService.rollback(commitId);
  }

  @Post('commit/rollback-to/:commitId')
  @UseGuards(AdminGuard)
  rollbackTo(@Param('commitId') commitId: string) {
    return this.mediaFsCommitService.rollbackTo(commitId);
  }

  @Get(':mediaId/playback')
  getPlayback(@Param('mediaId') mediaId: string) {
    return this.mediaService.getPlaybackPlan(mediaId);
  }

  private parseTagsQuery(raw: string | string[] | undefined): string[] {
    if (typeof raw === 'undefined') {
      return [];
    }

    const values = Array.isArray(raw) ? raw : [raw];
    const deduped = new Set<string>();

    for (const value of values) {
      if (typeof value !== 'string') {
        continue;
      }

      for (const splitValue of value.split(',')) {
        const cleaned = splitValue.trim();
        if (cleaned) {
          deduped.add(cleaned);
        }
      }
    }

    return [...deduped];
  }

  private parseRemoteProvidersQuery(
    raw: string | string[] | undefined,
  ): Array<'tmdb' | 'jikan'> | undefined {
    if (typeof raw === 'undefined') {
      return undefined;
    }

    const values = Array.isArray(raw) ? raw : [raw];
    const deduped = new Set<'tmdb' | 'jikan'>();

    for (const value of values) {
      if (typeof value !== 'string') {
        continue;
      }

      for (const splitValue of value.split(',')) {
        const cleaned = splitValue.trim().toLowerCase();

        if (cleaned === 'tmdb' || cleaned === 'jikan') {
          deduped.add(cleaned);
        }
      }
    }

    return deduped.size > 0 ? [...deduped] : undefined;
  }

  private parseBooleanQuery(raw: string | string[] | undefined): boolean {
    if (typeof raw === 'undefined') {
      return false;
    }

    const first = Array.isArray(raw) ? raw[0] : raw;
    if (typeof first !== 'string') {
      return false;
    }

    const cleaned = first.trim().toLowerCase();
    return (
      cleaned === '1' ||
      cleaned === 'true' ||
      cleaned === 'yes' ||
      cleaned === 'on'
    );
  }

  private parseStringArrayBody(raw: unknown): string[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    const deduped = new Set<string>();
    for (const value of raw) {
      if (typeof value !== 'string') {
        continue;
      }

      const cleaned = value.trim();
      if (cleaned) {
        deduped.add(cleaned);
      }
    }

    return [...deduped];
  }

  private normalizeUploadedJsonFile(
    value: unknown,
  ): { buffer: Buffer; mimetype: string } | undefined {
    if (!this.isObject(value)) {
      return undefined;
    }

    const candidateBuffer = value['buffer'];
    if (!Buffer.isBuffer(candidateBuffer)) {
      return undefined;
    }

    const candidateType =
      typeof value['mimetype'] === 'string' ? value['mimetype'].trim() : '';

    return {
      buffer: candidateBuffer,
      mimetype: candidateType,
    };
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
