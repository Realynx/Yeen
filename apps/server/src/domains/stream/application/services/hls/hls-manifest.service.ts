import { Injectable } from '@nestjs/common';
import { writeFile } from 'node:fs/promises';
import {
  computeSegmentTiming,
  segmentFileName,
  totalSegmentCount,
} from '../../../infrastructure/hls/hls-segment-naming';

export interface ManifestWriterInput {
  manifestPath: string;
  segmentSeconds: number;
  totalDurationSeconds: number;
}

export interface MasterManifestWriterInput {
  manifestPath: string;
  videoManifestFileName: string;
  audioManifestFileName: string;
  bandwidthBitsPerSecond: number;
}

/**
 * Writes the VOD playlist for an HLS session and rewrites manifests to embed
 * an access token on every segment line.
 *
 * Owning both responsibilities here keeps all manifest-text concerns in one
 * place; rewriting needs to know the same line-classification rules the
 * writer uses, so colocating them avoids drift.
 */
@Injectable()
export class HlsManifestService {
  async writeMasterManifest(input: MasterManifestWriterInput): Promise<void> {
    const bandwidth = Math.max(1, Math.round(input.bandwidthBitsPerSecond));
    const lines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Primary",DEFAULT=YES,AUTOSELECT=YES,URI="' +
        input.audioManifestFileName +
        '"',
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},AUDIO="audio"`,
      input.videoManifestFileName,
      '',
    ];
    await writeFile(input.manifestPath, lines.join('\n'), 'utf8');
  }

  async writeVodManifest(input: ManifestWriterInput): Promise<number> {
    const { manifestPath, segmentSeconds, totalDurationSeconds } = input;
    const totalSegments = totalSegmentCount(
      totalDurationSeconds,
      segmentSeconds,
    );
    const targetDuration = Math.max(1, Math.ceil(segmentSeconds));

    const lines: string[] = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      `#EXT-X-TARGETDURATION:${targetDuration}`,
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:VOD',
      '#EXT-X-INDEPENDENT-SEGMENTS',
    ];

    for (let i = 0; i < totalSegments; i += 1) {
      const timing = computeSegmentTiming(
        i,
        segmentSeconds,
        totalDurationSeconds,
        totalSegments,
      );
      lines.push(`#EXTINF:${timing.durationSeconds.toFixed(3)},`);
      lines.push(segmentFileName(i));
    }

    lines.push('#EXT-X-ENDLIST');
    lines.push('');

    await writeFile(manifestPath, lines.join('\n'), 'utf8');
    return totalSegments;
  }

  rewriteWithAccessToken(manifest: string, accessToken: string): string {
    return manifest
      .split(/\r?\n/)
      .map((line) => this.rewriteLine(line, accessToken))
      .join('\n');
  }

  private rewriteLine(line: string, accessToken: string): string {
    const trimmed = line.trim();
    if (!trimmed) {
      return line;
    }

    if (trimmed.startsWith('#EXT-X-MAP:')) {
      return line.replace(/URI="([^"]+)"/, (_, uri: string) => {
        return `URI="${this.appendAccessToken(uri, accessToken)}"`;
      });
    }

    if (trimmed.startsWith('#EXT-X-MEDIA:')) {
      return line.replace(/URI="([^"]+)"/, (_, uri: string) => {
        return `URI="${this.appendAccessToken(uri, accessToken)}"`;
      });
    }

    if (trimmed.startsWith('#')) {
      return line;
    }

    return this.appendAccessToken(line, accessToken);
  }

  private appendAccessToken(pathOrUrl: string, accessToken: string): string {
    const hashIndex = pathOrUrl.indexOf('#');
    const beforeHash =
      hashIndex >= 0 ? pathOrUrl.slice(0, hashIndex) : pathOrUrl;
    const hashSuffix = hashIndex >= 0 ? pathOrUrl.slice(hashIndex) : '';
    const separator = beforeHash.includes('?') ? '&' : '?';
    return `${beforeHash}${separator}access_token=${encodeURIComponent(accessToken)}${hashSuffix}`;
  }
}
