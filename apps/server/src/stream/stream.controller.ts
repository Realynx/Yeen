import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StreamService } from './stream.service';

@UseGuards(JwtAuthGuard)
@Controller('stream')
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @Post(':mediaId/hls/start')
  startHls(
    @Param('mediaId') mediaId: string,
    @Query('force') force?: string,
  ) {
    const forceFresh = force === '1' || force === 'true';
    return this.streamService.startHls(mediaId, { forceFresh });
  }

  @Get('hls/:sessionId/:fileName')
  getHlsFile(
    @Param('sessionId') sessionId: string,
    @Param('fileName') fileName: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const accessToken =
      typeof request.query.access_token === 'string'
        ? request.query.access_token
        : undefined;

    return this.streamService.streamHlsFile(
      sessionId,
      fileName,
      response,
      accessToken,
    );
  }

  @Get(':mediaId/direct')
  getDirect(
    @Param('mediaId') mediaId: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.streamService.streamDirect(mediaId, request, response);
  }
}
