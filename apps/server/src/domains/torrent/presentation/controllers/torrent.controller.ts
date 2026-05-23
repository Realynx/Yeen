import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../auth/presentation/guards/jwt-auth.guard';
import { TorrentAccessGuard } from '../../../auth/presentation/guards/torrent-access.guard';
import { AddTorrentDto } from '../../application/dto/add-torrent.dto';
import { DeleteTorrentDto } from '../../application/dto/delete-torrent.dto';
import { SetTorrentOrderModeDto } from '../../application/dto/set-torrent-order-mode.dto';
import { TorrentService } from '../../application/services/torrent.service';

@UseGuards(JwtAuthGuard, TorrentAccessGuard)
@Controller('torrents')
export class TorrentController {
  constructor(private readonly torrentService: TorrentService) {}

  @Get()
  listTorrents() {
    return this.torrentService.listTorrents();
  }

  @Post('add')
  @UseInterceptors(FileInterceptor('torrentFile'))
  addTorrent(
    @Body() dto: AddTorrentDto,
    @UploadedFile() torrentFile?: unknown,
  ) {
    const normalizedFile = this.normalizeUploadedFile(torrentFile);
    return this.torrentService.addTorrent(dto, normalizedFile);
  }

  @Post(':hash/start')
  startTorrent(@Param('hash') hash: string) {
    return this.torrentService.startTorrent(hash);
  }

  @Post(':hash/stop')
  stopTorrent(@Param('hash') hash: string) {
    return this.torrentService.stopTorrent(hash);
  }

  @Post(':hash/restart')
  restartTorrent(@Param('hash') hash: string) {
    return this.torrentService.restartTorrent(hash);
  }

  @Delete(':hash')
  deleteTorrent(@Param('hash') hash: string, @Body() dto: DeleteTorrentDto) {
    return this.torrentService.deleteTorrent(hash, dto.deleteFiles ?? false);
  }

  @Patch(':hash/order-mode')
  setTorrentOrderMode(
    @Param('hash') hash: string,
    @Body() dto: SetTorrentOrderModeDto,
  ) {
    return this.torrentService.setTorrentOrderMode(hash, dto.orderMode);
  }

  private normalizeUploadedFile(
    value: unknown,
  ): { buffer: Buffer; originalname: string } | undefined {
    if (!this.isObject(value)) {
      return undefined;
    }

    const candidateBuffer = value['buffer'];
    if (!Buffer.isBuffer(candidateBuffer)) {
      return undefined;
    }

    const candidateName =
      typeof value['originalname'] === 'string'
        ? value['originalname'].trim()
        : '';

    return {
      buffer: candidateBuffer,
      originalname: candidateName || 'upload.torrent',
    };
  }

  private isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}

