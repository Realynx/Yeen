import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExtractSubtitleDto } from './dto/extract-subtitle.dto';
import { SubtitleExtractionService } from './subtitle-extraction.service';
import { SubtitleFileStreamService } from './subtitle-file-stream.service';
import { SubtitleListingService } from './subtitle-listing.service';
import { SubtitleOnlineLookupService } from './subtitle-online-lookup.service';

@UseGuards(JwtAuthGuard)
@Controller('subtitles')
export class SubtitleController {
  constructor(
    private readonly subtitleFileStreamService: SubtitleFileStreamService,
    private readonly subtitleListingService: SubtitleListingService,
    private readonly subtitleExtractionService: SubtitleExtractionService,
    private readonly subtitleOnlineLookupService: SubtitleOnlineLookupService,
  ) {}

  @Get('file/:mediaId/:fileName')
  getFile(
    @Param('mediaId') mediaId: string,
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ) {
    const stream = this.subtitleFileStreamService.getSubtitleFile(
      mediaId,
      fileName,
    );
    response.setHeader('Content-Type', 'text/vtt; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    stream.pipe(response);
  }

  @Get(':mediaId')
  list(@Param('mediaId') mediaId: string) {
    return this.subtitleListingService.list(mediaId);
  }

  @Post(':mediaId/extract')
  extract(@Param('mediaId') mediaId: string, @Body() dto: ExtractSubtitleDto) {
    return this.subtitleExtractionService.extractEmbedded(
      mediaId,
      dto.streamIndex,
    );
  }

  @Get(':mediaId/lookup')
  lookup(
    @Param('mediaId') mediaId: string,
    @Query('language') language?: string,
  ) {
    return this.subtitleOnlineLookupService.lookup(mediaId, language ?? 'en');
  }
}
