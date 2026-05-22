import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';

/**
 * Thrown by `assertSegmentReadable` when the byte range a segment would read
 * from is not yet flushed to disk (zero-filled pre-allocation).
 *
 * Callers map this to an HTTP 503 + Retry-After so the HLS player buffers
 * naturally instead of receiving garbage transcoded output.
 */
export class SegmentNotYetDownloadedError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly offset: number,
    public readonly segmentIndex: number,
  ) {
    super(
      `Segment ${segmentIndex} requires byte offset ${offset} which is not yet downloaded.`,
    );
    this.name = 'SegmentNotYetDownloadedError';
  }
}

export interface SegmentReadinessInput {
  filePath: string;
  segmentIndex: number;
  startSeconds: number;
  durationSeconds: number;
  totalDurationSeconds: number;
  /** Total on-disk file size (always equals torrent-final size due to qBit pre-allocation). */
  fileSize: number;
  /**
   * Whether this source is potentially still downloading. Skips the check
   * entirely for fully-downloaded library media. When `true` and any sampled
   * region reads as all-zero, treats the segment as not-yet-downloaded.
   */
  mayBePartial: boolean;
}

/**
 * Detects whether the byte range needed by an HLS segment is actually present
 * on disk, vs. still zero-fill from qBittorrent's pre-allocation.
 *
 * Works by sampling 256 bytes at the segment's approximate start and end byte
 * offsets (computed from `seconds / totalDuration * fileSize`). Real H.264 /
 * AAC / MKV cluster data effectively never contains 256 consecutive zero
 * bytes, so an all-zero read is a reliable "not downloaded yet" signal.
 *
 * No qBittorrent API calls are required; the check runs against the same SMB
 * file the transcoder is about to read.
 */
@Injectable()
export class TorrentDataAvailabilityService {
  private readonly logger = new Logger(TorrentDataAvailabilityService.name);
  private static readonly SAMPLE_BYTES = 256;
  /**
   * Backstep applied to the start of the segment when computing the byte
   * offset to sample. ffmpeg's `-ss` reads from the nearest preceding
   * keyframe, which can be several seconds before the requested start.
   */
  private static readonly SEEK_BACKSTEP_SECONDS = 8;

  async assertSegmentReadable(input: SegmentReadinessInput): Promise<void> {
    if (!input.mayBePartial) {
      return;
    }
    if (
      !Number.isFinite(input.totalDurationSeconds) ||
      input.totalDurationSeconds <= 0 ||
      !Number.isFinite(input.fileSize) ||
      input.fileSize <= 0
    ) {
      return;
    }

    const startOffset = this.timeToOffset(
      Math.max(0, input.startSeconds - TorrentDataAvailabilityService.SEEK_BACKSTEP_SECONDS),
      input.totalDurationSeconds,
      input.fileSize,
    );
    const endOffset = this.timeToOffset(
      Math.min(
        input.totalDurationSeconds,
        input.startSeconds + input.durationSeconds,
      ),
      input.totalDurationSeconds,
      input.fileSize,
    );

    // Probe both endpoints so we catch the case where ffmpeg's read window
    // straddles the downloaded high-water mark.
    for (const offset of [startOffset, endOffset]) {
      const isZero = await this.isOffsetAllZero(input.filePath, offset);
      if (isZero) {
        this.logger.debug(
          `Segment ${input.segmentIndex} for ${input.filePath} blocked: zero-fill at byte ${offset}`,
        );
        throw new SegmentNotYetDownloadedError(
          input.filePath,
          offset,
          input.segmentIndex,
        );
      }
    }
  }

  private timeToOffset(
    seconds: number,
    totalDurationSeconds: number,
    fileSize: number,
  ): number {
    const fraction = Math.max(
      0,
      Math.min(1, seconds / totalDurationSeconds),
    );
    const offset = Math.floor(fraction * fileSize);
    return Math.max(
      0,
      Math.min(
        fileSize - TorrentDataAvailabilityService.SAMPLE_BYTES,
        offset,
      ),
    );
  }

  private async isOffsetAllZero(
    filePath: string,
    offset: number,
  ): Promise<boolean> {
    const cached = await this.readSample(filePath, offset, 'r');
    if (cached === null) {
      // Treat read failures as "available" so we don't block on transient
      // SMB errors — ffmpeg will surface a more accurate diagnostic.
      return false;
    }

    if (cached.length > 0 && !this.isAllZero(cached)) {
      return false;
    }

    const uncached = await this.readSample(filePath, offset, 'rs');
    if (
      uncached !== null
      && uncached.length > 0
      && !this.isAllZero(uncached)
    ) {
      return false;
    }

    if (process.platform === 'win32') {
      const unbuffered = await this.readSampleUnbuffered(
        filePath,
        offset,
        TorrentDataAvailabilityService.SAMPLE_BYTES,
      );
      if (
        unbuffered !== null
        && unbuffered.length > 0
        && !this.isAllZero(unbuffered)
      ) {
        return false;
      }
      if (unbuffered !== null) {
        return unbuffered.length === 0 || this.isAllZero(unbuffered);
      }
    }

    return cached.length === 0 || this.isAllZero(cached);
  }

  private isAllZero(buffer: Buffer): boolean {
    return buffer.every((byte) => byte === 0);
  }

  private async readSample(
    filePath: string,
    offset: number,
    flag: 'r' | 'rs',
  ): Promise<Buffer | null> {
    const handle = await open(filePath, flag).catch(() => null);
    if (!handle) {
      return null;
    }

    try {
      const buffer = Buffer.alloc(TorrentDataAvailabilityService.SAMPLE_BYTES);
      const { bytesRead } = await handle.read(
        buffer,
        0,
        TorrentDataAvailabilityService.SAMPLE_BYTES,
        offset,
      );
      return bytesRead > 0 ? buffer.subarray(0, bytesRead) : Buffer.alloc(0);
    } catch (error) {
      this.logger.debug(
        `Availability probe read failed (${flag}) at offset ${offset} of ${filePath}: ${(error as Error).message}`,
      );
      return null;
    } finally {
      await handle.close().catch(() => undefined);
    }
  }

  private async readSampleUnbuffered(
    filePath: string,
    offset: number,
    byteCount: number,
  ): Promise<Buffer | null> {
    const sectorSize = 512;
    const alignedOffset = Math.floor(offset / sectorSize) * sectorSize;
    const offsetInsideBuffer = offset - alignedOffset;
    const neededBytes = offsetInsideBuffer + byteCount;
    const alignedBytes = Math.max(
      sectorSize,
      Math.ceil(neededBytes / sectorSize) * sectorSize,
    );
    const escapedPath = filePath.replace(/'/g, "''");

    const script =
      "$ErrorActionPreference='Stop';"
      + `$p='${escapedPath}';`
      + `$o=${alignedOffset};`
      + `$s=${alignedBytes};`
      + 'try{'
      + '$fs=New-Object System.IO.FileStream('
      + '$p,'
      + '[System.IO.FileMode]::Open,'
      + '[System.IO.FileAccess]::Read,'
      + '[System.IO.FileShare]::ReadWrite,'
      + '4096,'
      + '([System.IO.FileOptions][int]0x20000000));'
      + '$null=$fs.Seek($o,[System.IO.SeekOrigin]::Begin);'
      + '$b=New-Object byte[] $s;'
      + '$n=$fs.Read($b,0,$s);'
      + '$fs.Close();'
      + 'if($n -le 0){exit 2}'
      + '[Console]::OpenStandardOutput().Write($b,0,$n);'
      + 'exit 0'
      + '}catch{[Console]::Error.WriteLine($_.Exception.Message);exit 3}';

    const raw = await new Promise<Buffer | null>((resolvePromise) => {
      let settled = false;
      const settle = (value: Buffer | null) => {
        if (settled) {
          return;
        }
        settled = true;
        resolvePromise(value);
      };

      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            script,
          ],
          { windowsHide: true },
        );
      } catch {
        settle(null);
        return;
      }

      const chunks: Buffer[] = [];
      child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
      child.on('error', () => settle(null));
      child.on('close', (code) => {
        if (code !== 0) {
          settle(null);
          return;
        }
        const payload = Buffer.concat(chunks);
        settle(payload.length > 0 ? payload : Buffer.alloc(0));
      });

      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // ignore
        }
        settle(null);
      }, 5000);
      child.on('close', () => clearTimeout(timer));
    });

    if (!raw) {
      return null;
    }

    const start = Math.min(offsetInsideBuffer, raw.length);
    const end = Math.min(raw.length, start + byteCount);
    if (end <= start) {
      return Buffer.alloc(0);
    }

    return raw.subarray(start, end);
  }
}
