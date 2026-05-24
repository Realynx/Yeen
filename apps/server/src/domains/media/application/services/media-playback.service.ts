import { Injectable, Logger } from '@nestjs/common';
import { MediaItem } from '../../domain/entities/media-item.entity';
import { SystemSettingsService } from '../../../system-settings/application/services/system-settings.service';
import { MediaProbeAdapter } from '../../infrastructure/media-probe.adapter';
import { MediaFileResolutionService } from './path-resolution/media-file-resolution.service';
import {
  TorrentService,
  type TorrentListItem,
} from '../../../torrent/application/services/torrent.service';
import { TorrentMediaIndexStore } from '../../../torrent/infrastructure/stores/torrent-media-index.store';

interface MediaPlaybackAudioTrack {
  streamIndex: number;
  label: string;
  language: string | null;
  codec: string | null;
  channels: number | null;
  isDefault: boolean;
}

interface MediaTorrentDownloadProgressItem {
  mediaId: string;
  hash: string;
  progressPercent: number;
  state: string;
}

@Injectable()
export class MediaPlaybackService {
  private static readonly ACTIVE_TORRENT_DOWNLOAD_STATES = new Set([
    'downloading',
    'forceddl',
    'stalldl',
    'stalleddl',
    'metadl',
    'queueddl',
    'checkingdl',
  ]);

  private readonly directPlayExtensions = new Set(['.mp4', '.m4v', '.webm']);
  private readonly directPlayVideoCodecHints = [
    'h264',
    'avc',
    'avc1',
    'vp8',
    'vp9',
    'av1',
  ];
  private readonly directPlayAudioCodecHints = ['aac', 'mp3', 'opus', 'vorbis'];
  private readonly logger = new Logger(MediaPlaybackService.name);

  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly mediaProbeAdapter: MediaProbeAdapter,
    private readonly mediaFileResolutionService: MediaFileResolutionService,
    private readonly torrentService: TorrentService,
    private readonly torrentMediaIndexStore: TorrentMediaIndexStore,
  ) {}

  async getPlaybackAudioTracks(
    item: MediaItem,
  ): Promise<MediaPlaybackAudioTrack[]> {
    const systemSettings = await this.systemSettingsService.getSettings();
    const ffprobePath = systemSettings.ffprobePath || 'ffprobe';

    const canonicalFilePath = await this.mediaFileResolutionService
      .resolveMediaFilePath(item.filePath, item.relativePath)
      .catch(() => item.filePath);
    const probePath =
      await this.mediaFileResolutionService.resolvePlaybackProbePath(
        canonicalFilePath,
      );

    try {
      const payload = await this.mediaProbeAdapter.probeFile(
        probePath,
        ffprobePath,
      );
      const streams = Array.isArray(payload.streams) ? payload.streams : [];
      const audioStreams = streams.filter(
        (stream) =>
          stream.codec_type === 'audio' &&
          Number.isInteger(stream.index) &&
          stream.index >= 0,
      );

      if (audioStreams.length === 0) {
        return [];
      }

      const defaultStreamIndex =
        audioStreams.find((stream) => (stream.disposition?.default ?? 0) > 0)
          ?.index ?? audioStreams[0].index;

      return audioStreams.map((stream, position) => {
        const language = this.normalizePlaybackTrackLanguage(
          stream.tags?.language,
        );
        const codec = this.normalizePlaybackTrackCodec(stream.codec_name);
        const channels =
          typeof stream.channels === 'number' &&
          Number.isFinite(stream.channels)
            ? Math.max(1, Math.round(stream.channels))
            : null;
        const title = stream.tags?.title?.trim() || '';

        return {
          streamIndex: stream.index,
          label: this.buildPlaybackTrackLabel({
            fallbackPosition: position + 1,
            title,
            language,
            codec,
            channels,
          }),
          language,
          codec,
          channels,
          isDefault: stream.index === defaultStreamIndex,
        };
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Unable to list audio tracks for ${item.relativePath}: ${message}`,
      );
      return [];
    }
  }

  async getPlaybackPlan(item: MediaItem) {
    const torrentIndex =
      (await this.torrentMediaIndexStore.getByMediaId(item.id)) ??
      (await this.torrentMediaIndexStore.getByRelatedFilePath(item.filePath));

    return {
      mediaId: item.id,
      title: item.title,
      directPlay: {
        supported: this.supportsDirectPlay(item),
        url: `/api/stream/${item.id}/direct`,
      },
      hls: {
        startUrl: `/api/stream/${item.id}/hls/start`,
      },
      subtitles: {
        listUrl: `/api/subtitles/${item.id}`,
      },
      torrent: torrentIndex
        ? {
            hash: torrentIndex.hash,
            statusUrl: `/api/media/torrent/${torrentIndex.hash}/status`,
          }
        : null,
    };
  }

  async getTorrentDownloadProgressByMediaIds(mediaIds: string[]) {
    const normalizedMediaIds = [
      ...new Set(
        mediaIds
          .map((mediaId) => mediaId.trim())
          .filter((mediaId) => mediaId.length > 0),
      ),
    ];

    if (normalizedMediaIds.length === 0) {
      return { items: [] as MediaTorrentDownloadProgressItem[] };
    }

    const indexByMediaId =
      await this.torrentMediaIndexStore.getByMediaIds(normalizedMediaIds);

    if (indexByMediaId.size === 0) {
      return { items: [] as MediaTorrentDownloadProgressItem[] };
    }

    let torrents: TorrentListItem[] = [];
    try {
      const listResult = await this.torrentService.listTorrents();
      torrents = Array.isArray(listResult.items) ? listResult.items : [];
    } catch {
      return { items: [] as MediaTorrentDownloadProgressItem[] };
    }

    const activeTorrentsByHash = new Map<string, TorrentListItem>();
    for (const torrent of torrents) {
      const normalizedHash = torrent.hash.trim().toLowerCase();
      if (!normalizedHash) {
        continue;
      }

      if (!this.isActiveDownloadingTorrentState(torrent.state)) {
        continue;
      }

      activeTorrentsByHash.set(normalizedHash, torrent);
    }

    const items: MediaTorrentDownloadProgressItem[] = [];
    for (const mediaId of normalizedMediaIds) {
      const indexEntry = indexByMediaId.get(mediaId);
      if (!indexEntry) {
        continue;
      }

      const torrent = activeTorrentsByHash.get(indexEntry.hash);
      if (!torrent) {
        continue;
      }

      const normalizedProgress = Number.isFinite(torrent.progress)
        ? Math.min(1, Math.max(0, torrent.progress))
        : 0;

      items.push({
        mediaId,
        hash: indexEntry.hash,
        progressPercent: normalizedProgress * 100,
        state: torrent.state,
      });
    }

    return { items };
  }

  private isActiveDownloadingTorrentState(
    state: string | null | undefined,
  ): boolean {
    if (!state) {
      return false;
    }

    const normalized = state.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    if (MediaPlaybackService.ACTIVE_TORRENT_DOWNLOAD_STATES.has(normalized)) {
      return true;
    }

    return normalized.includes('dl');
  }

  private supportsDirectPlay(item: MediaItem): boolean {
    const extension = item.extension.toLowerCase();
    if (!this.directPlayExtensions.has(extension)) {
      return false;
    }

    const videoCodec = (item.videoCodec ?? '').toLowerCase();
    if (!videoCodec) {
      return false;
    }

    const videoSupported = this.directPlayVideoCodecHints.some((hint) =>
      videoCodec.includes(hint),
    );
    if (!videoSupported) {
      return false;
    }

    const audioCodec = (item.audioCodec ?? '').toLowerCase();
    if (!audioCodec) {
      return true;
    }

    return this.directPlayAudioCodecHints.some((hint) =>
      audioCodec.includes(hint),
    );
  }

  private normalizePlaybackTrackLanguage(
    value: string | undefined,
  ): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    return normalized.toLowerCase();
  }

  private normalizePlaybackTrackCodec(
    value: string | undefined,
  ): string | null {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    return normalized.toLowerCase();
  }

  private buildPlaybackTrackLabel(input: {
    fallbackPosition: number;
    title: string;
    language: string | null;
    codec: string | null;
    channels: number | null;
  }): string {
    if (input.title) {
      return input.title;
    }

    const details: string[] = [];
    if (input.language) {
      details.push(input.language.toUpperCase());
    }
    if (input.codec) {
      details.push(input.codec.toUpperCase());
    }
    if (input.channels !== null) {
      details.push(`${input.channels}ch`);
    }

    if (details.length === 0) {
      return `Track ${input.fallbackPosition}`;
    }

    return `Track ${input.fallbackPosition} (${details.join(', ')})`;
  }
}
