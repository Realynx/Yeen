import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { ExtractSubtitleDto } from '../../application/dto/extract-subtitle.dto';
import { SubtitleExtractionService } from '../../application/services/subtitle-extraction.service';
import { SubtitleFileStreamService } from '../../application/services/subtitle-file-stream.service';
import { SubtitleListingService } from '../../application/services/subtitle-listing.service';
import { SubtitleOnlineLookupService } from '../../application/services/subtitle-online-lookup.service';

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
  list(@Param('mediaId') mediaId: string, @Req() request: Request) {
    return this.subtitleListingService.list(
      mediaId,
      this.resolveAccessToken(request),
    );
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

  private resolveAccessToken(request: Request): string | null {
    const authorization = request.header('authorization')?.trim() ?? '';
    const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization);
    if (bearerMatch && bearerMatch[1]) {
      return bearerMatch[1].trim();
    }

    const queryToken = request.query.access_token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim();
    }

    return null;
  }
}

