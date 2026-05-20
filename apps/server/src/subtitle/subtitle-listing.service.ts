import { Injectable } from '@nestjs/common';
import { MediaService } from '../media/media.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SubtitleTracksService } from './subtitle-tracks.service';

@Injectable()
export class SubtitleListingService {
  constructor(
    private readonly mediaService: MediaService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly subtitleTracksService: SubtitleTracksService,
  ) {}

  async list(mediaId: string) {
    const media = await this.mediaService.getById(mediaId);
    const systemSettings = await this.systemSettingsService.getSettings();

    const embeddedTracks = await this.subtitleTracksService.probeEmbeddedTracks(
      mediaId,
      media.filePath,
      systemSettings.ffprobePath,
    );
    const externalTracks =
      await this.subtitleTracksService.prepareExternalTracks(
        mediaId,
        media.filePath,
        systemSettings.ffmpegPath,
      );

    return {
      tracks: [...embeddedTracks, ...externalTracks],
    };
  }
}
