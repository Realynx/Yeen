import { spawn } from 'node:child_process';
import { stat, statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';

interface MediaDriveStorageSnapshot {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
}

export interface MediaStorageSummaryResult {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  driveCount: number;
  unavailableDriveCount: number;
  asOf: string;
}

@Injectable()
export class MediaStorageSummaryService {
  async summarizeStorage(
    locations: readonly string[],
  ): Promise<MediaStorageSummaryResult> {
    const storageSourcePaths = await this.collectStorageSourcePaths(locations);

    let totalBytes = 0;
    let usedBytes = 0;
    let availableBytes = 0;
    let driveCount = 0;
    let unavailableDriveCount = 0;

    for (const sourcePath of storageSourcePaths) {
      const snapshot = await this.readDriveStorageSnapshot(sourcePath);
      if (!snapshot) {
        unavailableDriveCount += 1;
        continue;
      }

      driveCount += 1;
      totalBytes += snapshot.totalBytes;
      usedBytes += snapshot.usedBytes;
      availableBytes += snapshot.availableBytes;
    }

    return {
      totalBytes,
      usedBytes,
      availableBytes,
      usedPercent: this.toPercent(usedBytes, totalBytes),
      driveCount,
      unavailableDriveCount,
      asOf: new Date().toISOString(),
    };
  }

  private async collectStorageSourcePaths(
    locations: readonly string[],
  ): Promise<string[]> {
    const sourcePathByDeviceKey = new Map<string, string>();
    const fallbackSourcePaths = new Set<string>();

    for (const location of locations) {
      const candidates = this.toStoragePathCandidates(location);
      if (candidates.length === 0) {
        continue;
      }

      let matchedDevice = false;

      for (const candidate of candidates) {
        const deviceKey = await this.readStorageDeviceKey(candidate);
        if (!deviceKey) {
          continue;
        }

        if (!sourcePathByDeviceKey.has(deviceKey)) {
          sourcePathByDeviceKey.set(deviceKey, candidate);
        }

        matchedDevice = true;
        break;
      }

      if (!matchedDevice) {
        fallbackSourcePaths.add(candidates[0]);
      }
    }

    const deduped = [...sourcePathByDeviceKey.values()];
    const dedupeKeySet = new Set(
      deduped.map((pathValue) => this.toStoragePathKey(pathValue)),
    );

    for (const fallbackPath of fallbackSourcePaths) {
      const key = this.toStoragePathKey(fallbackPath);
      if (dedupeKeySet.has(key)) {
        continue;
      }

      dedupeKeySet.add(key);
      deduped.push(fallbackPath);
    }

    return deduped;
  }

  private toStoragePathCandidates(location: string): string[] {
    const trimmed = location.trim();
    if (!trimmed) {
      return [];
    }

    const candidates: string[] = [];
    const seen = new Set<string>();

    const addCandidate = (candidate: string) => {
      const cleaned = candidate.trim();
      if (!cleaned) {
        return;
      }

      const key = this.toStoragePathKey(cleaned);
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      candidates.push(cleaned);
    };

    addCandidate(trimmed);
    addCandidate(resolve(trimmed));

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex > 1) {
      const prefix = trimmed.slice(0, colonIndex);
      const suffix = trimmed.slice(colonIndex + 1).trim();

      if (!/^[A-Za-z]$/.test(prefix) && suffix.startsWith('/')) {
        addCandidate(suffix);
        addCandidate(resolve(suffix));
      }
    }

    return candidates;
  }

  private toStoragePathKey(pathValue: string): string {
    return process.platform === 'win32' ? pathValue.toLowerCase() : pathValue;
  }

  private async readStorageDeviceKey(
    pathValue: string,
  ): Promise<string | null> {
    try {
      const pathStats = await stat(pathValue);
      if (!pathStats.isDirectory()) {
        return null;
      }

      const deviceNumber = Number(pathStats.dev);
      if (!Number.isFinite(deviceNumber)) {
        return null;
      }

      return `dev:${deviceNumber}`;
    } catch {
      return null;
    }
  }

  private async readDriveStorageSnapshot(
    driveRoot: string,
  ): Promise<MediaDriveStorageSnapshot | null> {
    try {
      const stats = await statfs(driveRoot, { bigint: true });

      if (this.shouldUseFsutilFallback(stats, driveRoot)) {
        const fsutilSnapshot =
          await this.readDriveStorageSnapshotViaFsutil(driveRoot);
        if (fsutilSnapshot) {
          return fsutilSnapshot;
        }
      }

      const blockSize = this.toFiniteStatfsValue(stats.bsize);
      const totalBlocks = this.toFiniteStatfsValue(stats.blocks);
      const availableBlocks =
        this.toFiniteStatfsValue(stats.bfree) ??
        this.toFiniteStatfsValue(stats.bavail);

      if (blockSize === null || availableBlocks === null) {
        return null;
      }

      const computedAvailableBytes = Math.max(
        0,
        Math.round(blockSize * availableBlocks),
      );
      const totalBytes =
        totalBlocks === null
          ? computedAvailableBytes
          : Math.max(0, Math.round(blockSize * totalBlocks));
      const availableBytes =
        totalBlocks === null
          ? computedAvailableBytes
          : Math.min(totalBytes, computedAvailableBytes);
      const usedBytes = Math.max(0, totalBytes - availableBytes);

      return {
        totalBytes,
        usedBytes,
        availableBytes,
      };
    } catch {
      return null;
    }
  }

  private shouldUseFsutilFallback(
    stats: {
      blocks: number | bigint;
      bfree: number | bigint;
      bavail: number | bigint;
    },
    pathValue: string,
  ): boolean {
    if (process.platform !== 'win32' || !this.isUncPath(pathValue)) {
      return false;
    }

    const maxUint32 = 4_294_967_295n;
    const blocks = this.toBigintStatfsValue(stats.blocks);
    const bfree = this.toBigintStatfsValue(stats.bfree);
    const bavail = this.toBigintStatfsValue(stats.bavail);

    return blocks === maxUint32 || bfree === maxUint32 || bavail === maxUint32;
  }

  private isUncPath(pathValue: string): boolean {
    return pathValue.startsWith('\\\\');
  }

  private toBigintStatfsValue(value: number | bigint): bigint | null {
    if (typeof value === 'bigint') {
      return value;
    }

    if (!Number.isFinite(value) || value < 0) {
      return null;
    }

    return BigInt(Math.trunc(value));
  }

  private async readDriveStorageSnapshotViaFsutil(
    pathValue: string,
  ): Promise<MediaDriveStorageSnapshot | null> {
    return await new Promise<MediaDriveStorageSnapshot | null>(
      (resolvePromise) => {
        let settled = false;
        const settle = (value: MediaDriveStorageSnapshot | null) => {
          if (settled) {
            return;
          }

          settled = true;
          resolvePromise(value);
        };

        let child: ReturnType<typeof spawn>;
        try {
          child = spawn('fsutil', ['volume', 'diskfree', pathValue], {
            windowsHide: true,
          });
        } catch {
          settle(null);
          return;
        }

        let output = '';

        child.stdout?.on('data', (chunk: Buffer | string) => {
          output += chunk.toString();
        });

        child.stderr?.on('data', (chunk: Buffer | string) => {
          output += chunk.toString();
        });

        child.on('error', () => {
          settle(null);
        });

        child.on('close', () => {
          const totalBytes = this.parseFsutilBytes(output, 'Total bytes');
          const freeBytes = this.parseFsutilBytes(output, 'Total free bytes');

          if (totalBytes === null || freeBytes === null) {
            settle(null);
            return;
          }

          const availableBytes = Math.max(0, Math.min(totalBytes, freeBytes));
          const usedBytes = Math.max(0, totalBytes - availableBytes);

          settle({
            totalBytes,
            usedBytes,
            availableBytes,
          });
        });

        const timer = setTimeout(() => {
          try {
            child.kill();
          } catch {
            // Ignore kill errors.
          }

          settle(null);
        }, 5000);

        child.on('close', () => {
          clearTimeout(timer);
        });
      },
    );
  }

  private parseFsutilBytes(output: string, label: string): number | null {
    const pattern = new RegExp(`${label}\\s*:\\s*([0-9,]+)`, 'i');
    const match = output.match(pattern);

    if (!match) {
      return null;
    }

    const value = Number.parseInt(match[1].replace(/,/g, ''), 10);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }

    return value;
  }

  private toFiniteStatfsValue(value: number | bigint): number | null {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }

    const asNumber = Number(value);
    return Number.isFinite(asNumber) ? asNumber : null;
  }

  private toPercent(value: number, total: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
      return 0;
    }

    const ratio = value / total;
    return Math.max(0, Math.min(100, Math.round(ratio * 1000) / 10));
  }
}
