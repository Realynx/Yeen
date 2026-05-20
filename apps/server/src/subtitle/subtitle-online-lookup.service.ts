import { Injectable } from '@nestjs/common';
import { MediaService } from '../media/media.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { SubtitleLookupService } from './subtitle-lookup.service';

@Injectable()
export class SubtitleOnlineLookupService {
  constructor(
    private readonly mediaService: MediaService,
    private readonly systemSettingsService: SystemSettingsService,
    private readonly subtitleLookupService: SubtitleLookupService,
  ) {}

  async lookup(mediaId: string, language = 'en') {
    const systemSettings = await this.systemSettingsService.getSettings();
    const apiKey = systemSettings.openSubtitlesApiKey.trim();
    const preferredLanguage =
      language?.trim() || systemSettings.subtitleDefaultLanguage || 'en';

    if (!apiKey) {
      return {
        enabled: false,
        results: [],
        message: 'Set OPENSUBTITLES_API_KEY to enable online subtitle lookup.',
      };
    }

    const media = await this.mediaService.getById(mediaId);
    const results = await this.subtitleLookupService.lookupByTitle(
      media.title,
      apiKey,
      preferredLanguage,
    );

    return {
      enabled: true,
      results,
    };
  }
}
