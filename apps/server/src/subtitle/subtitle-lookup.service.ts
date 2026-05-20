import { BadRequestException, Injectable } from '@nestjs/common';

interface OpenSubtitlesItem {
  id?: string;
  attributes?: {
    language?: string;
    release?: string;
    download_count?: number;
    files?: Array<{
      file_id?: number;
    }>;
  };
}

interface OpenSubtitlesResponse {
  data?: OpenSubtitlesItem[];
}

@Injectable()
export class SubtitleLookupService {
  async lookupByTitle(title: string, apiKey: string, language: string) {
    const query = encodeURIComponent(title);
    const url = `https://api.opensubtitles.com/api/v1/subtitles?query=${query}&languages=${encodeURIComponent(language)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Api-Key': apiKey,
        'User-Agent': 'Yeen/0.1',
      },
    });

    if (!response.ok) {
      throw new BadRequestException(
        `OpenSubtitles request failed with ${response.status}.`,
      );
    }

    const body = (await response.json()) as OpenSubtitlesResponse;

    return (body.data ?? []).slice(0, 10).map((item) => {
      const fileId = item.attributes?.files?.[0]?.file_id;
      return {
        id: item.id ?? null,
        fileId: fileId ?? null,
        language: item.attributes?.language ?? null,
        release: item.attributes?.release ?? null,
        downloadCount: item.attributes?.download_count ?? 0,
      };
    });
  }
}
