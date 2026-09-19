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
import { AdminGuard } from '../../../auth/presentation/guards/admin.guard';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { ScanMediaDto } from '../../application/dto/scan-media.dto';
import { SetMediaLocationsDto } from '../../application/dto/set-media-locations.dto';
import {
  BulkAssignEpisodesDto,
  BulkUpdateMediaDto,
  UpdateMediaDto,
} from '../../application/dto/update-media.dto';
import { BulkDeleteMediaDto } from '../../application/dto/delete-media.dto';
import {
  CommitMetadataDto,
  PlanCommitMetadataDto,
} from '../../application/dto/commit-metadata.dto';
import { ImportMetadataDto } from '../../application/dto/import-metadata.dto';
import { PurgeRecycleDeletionsDto } from '../../application/dto/purge-recycle-deletions.dto';
import { MediaFsCommitService } from '../../application/services/filesystem/media-fs-commit.service';
import { MediaEpisodeNavigationService } from '../../application/services/media-episode-navigation.service';
import { MediaService } from '../../application/services/media.service';
import { RemoteMusicCatalogService } from '../../application/services/remote-music/remote-music-catalog.service';
import {
  normalizeUploadedJsonFile,
  parseBooleanQuery,
  parseRemoteProvidersQuery,
  parseTagsQuery,
} from './media.controller.helpers';

@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly mediaEpisodeNavigationService: MediaEpisodeNavigationService,
    private readonly mediaFsCommitService: MediaFsCommitService,
    private readonly remoteMusicCatalogService: RemoteMusicCatalogService,
  ) {}

  @Get()
  list(
    @Query('q') query?: string,
    @Query('tags') tags?: string | string[],
    @Query('libraryType') libraryType?: string,
  ) {
    const normalizedLibraryType =
      libraryType === 'music' || libraryType === 'video'
        ? libraryType
        : 'video';
    return this.mediaService.list(
      query,
      parseTagsQuery(tags),
      normalizedLibraryType,
    );
  }

  @Get('locations')
  @UseGuards(AdminGuard)
  getLocations() {
    return this.mediaService.getLocations();
  }

  @Put('locations')
  @UseGuards(AdminGuard)
  setLocations(@Body() dto: SetMediaLocationsDto) {
    return this.mediaService.setLocations(
      dto.libraryLocations ?? dto.locations ?? [],
    );
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

  @Get('storage-summary')
  getStorageSummary() {
    return this.mediaService.getStorageSummary();
  }

  @Post('scan')
  @UseGuards(AdminGuard)
  scan(@Body() dto: ScanMediaDto) {
    return this.mediaService.scan(
      dto.libraryPath,
      dto.libraryPaths,
      dto.libraryLocations,
    );
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
      providers: parseRemoteProvidersQuery(providers),
      tags: parseTagsQuery(tags),
      useCache: !parseBooleanQuery(noCache),
    });
  }

  @Get('music/search/remote')
  searchRemoteMusic(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('providers') providers?: string | string[],
  ) {
    return this.remoteMusicCatalogService.search({
      query: query ?? '',
      limit: parseInteger(limit),
      page: parseInteger(page),
      providers: parseProviderList(providers),
    });
  }

  @Get('music/discover')
  discoverRemoteMusic(
    @Query('limit') limit?: string,
    @Query('providers') providers?: string | string[],
  ) {
    return this.remoteMusicCatalogService.discover({
      limit: parseInteger(limit),
      providers: parseProviderList(providers),
    });
  }

  @Get('music/:mediaId/metadata/candidates')
  getRemoteMusicMetadataCandidates(
    @Param('mediaId') mediaId: string,
    @Query('limit') limit?: string,
  ) {
    return this.remoteMusicCatalogService.metadataCandidates(
      mediaId,
      parseInteger(limit),
    );
  }

  @Get('remote/:remoteId/series-catalog')
  getRemoteSeriesEpisodeCatalog(@Param('remoteId') remoteId: string) {
    return this.mediaService.getRemoteSeriesEpisodeCatalog(remoteId);
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

  @Get(':mediaId/next-episode')
  getEpisodeNavigation(@Param('mediaId') mediaId: string) {
    return this.mediaEpisodeNavigationService.getEpisodeNavigation(mediaId);
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
    const normalizedFile = normalizeUploadedJsonFile(importFile);
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
}

function parseInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseProviderList(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}
