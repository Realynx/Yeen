import { Controller, Get, Param, ParseIntPipe, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MediaService } from './media.service';

@Controller('media-images')
export class MediaImagesController {
  constructor(private readonly mediaService: MediaService) {}

  @Get(':mediaId/preview')
  getPreview(@Param('mediaId') mediaId: string, @Res() response: Response) {
    return this.mediaService.streamPreviewImage(mediaId, response);
  }

  @Get(':mediaId/backdrop')
  getBackdrop(@Param('mediaId') mediaId: string, @Res() response: Response) {
    return this.mediaService.streamBackdropImage(mediaId, response);
  }

  @Get(':mediaId/chapter/:index')
  getChapterThumbnail(
    @Param('mediaId') mediaId: string,
    @Param('index', ParseIntPipe) index: number,
    @Res() response: Response,
  ) {
    return this.mediaService.streamChapterThumbnail(mediaId, index, response);
  }
}
