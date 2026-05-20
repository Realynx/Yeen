import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
import { MediaFsCommitService } from './media-fs-commit.service';
import { MediaService } from './media.service';

@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(
    private readonly mediaService: MediaService,
    private readonly mediaFsCommitService: MediaFsCommitService,
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

  @Get('stats')
  getStats() {
    return this.mediaService.getStats();
  }

  @Post('scan')
  @UseGuards(AdminGuard)
  scan(@Body() dto: ScanMediaDto) {
    return this.mediaService.scan(dto.libraryPath, dto.libraryPaths);
  }

  @Get(':mediaId')
  getById(@Param('mediaId') mediaId: string) {
    return this.mediaService.getById(mediaId);
  }

  @Get(':mediaId/detect')
  detectFilename(@Param('mediaId') mediaId: string) {
    return this.mediaService.detectFilenameMetadata(mediaId);
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

  @Patch(':mediaId')
  @UseGuards(AdminGuard)
  updateMedia(
    @Param('mediaId') mediaId: string,
    @Body() dto: UpdateMediaDto,
  ) {
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
}
