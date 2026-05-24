import { Injectable, Logger } from '@nestjs/common';
import { basename, extname } from 'node:path';
import { SystemSettings } from '../../../../system-settings/domain/entities/system-settings.entity';
import { SystemSettingsService } from '../../../../system-settings/application/services/system-settings.service';
import { cleanTitle } from '../../../infrastructure/helpers/title-normalizer';
import {
  type AiTitleBatchEntry,
  MediaAiTitleProviderService,
} from './media-ai-title-provider.service';

@Injectable()
export class MediaAiMetadataService {
  private readonly logger = new Logger(MediaAiMetadataService.name);

  /**
   * How long a whole scan may spend in AI normalisation before we give up
   * and rely on heuristic cleanup for the remainder. Keeps a stalled
   * provider from blocking the entire scan. Sized to fit several full
   * batches plus one cold model load at the configured per-batch timeout.
   */
  private readonly maxNormalizationWindowMs = 5 * 60_000;

  /** Cool-off after a timeout so we don't immediately retry a stuck model. */
  private readonly aiBackoffDurationMs = 5 * 60_000;
  private aiBackoffUntil = 0;
  private aiFailureLogged = false;

  /**
   * Names per AI request. Kept small because Ollama's grammar-constrained
   * sampling (JSON schema `format`) scales super-linearly with item count;
   * 4 items typically completes in well under a 60s timeout even on 7B+
   * models, while larger batches risk blowing past it.
   */
  private readonly batchSize = 4;

  /**
   * Smallest batch we'll keep trying after a timeout. If a batch this size
   * still times out we treat the provider as stuck and back off.
   */
  private readonly minAdaptiveBatchSize = 2;

  constructor(
    private readonly systemSettingsService: SystemSettingsService,
    private readonly mediaAiTitleProviderService: MediaAiTitleProviderService,
  ) {}

  async normalizeTitlesForPaths(
    filePaths: string[],
    onProgress?: (progress: { done: number; total: number }) => void,
  ): Promise<Map<string, string>> {
    const rawNameByPath = new Map<string, string>();
    for (const filePath of filePaths) {
      rawNameByPath.set(filePath, basename(filePath, extname(filePath)));
    }

    const uniqueRawNames = [...new Set(rawNameByPath.values())];
    const normalizedByRaw = await this.normalizeUniqueRawNames(
      uniqueRawNames,
      onProgress,
    );

    const normalizedByPath = new Map<string, string>();
    for (const [filePath, rawName] of rawNameByPath.entries()) {
      const resolved = normalizedByRaw.get(rawName) ?? cleanTitle(rawName);
      normalizedByPath.set(filePath, resolved);
    }

    return normalizedByPath;
  }

  private async normalizeUniqueRawNames(
    rawNames: string[],
    onProgress?: (progress: { done: number; total: number }) => void,
  ): Promise<Map<string, string>> {
    // Seed the heuristic result for every name. Anything the AI returns
    // afterwards overrides the heuristic, so a partial AI response (or
    // none at all) still leaves us with a usable title.
    const normalizedByRaw = new Map<string, string>();
    for (const rawName of rawNames) {
      normalizedByRaw.set(rawName, cleanTitle(rawName));
    }

    if (rawNames.length === 0) {
      return normalizedByRaw;
    }

    const settings = await this.systemSettingsService.getSettings();
    if (!settings.aiMetadataEnabled || !settings.aiModel.trim()) {
      return normalizedByRaw;
    }

    if (Date.now() < this.aiBackoffUntil) {
      return normalizedByRaw;
    }

    // Group names that already share an identical heuristic clean title.
    // Files that differ only in release noise (resolution, group, codec)
    // collapse to one AI call, which is the biggest single speed win for
    // libraries containing the same show many times.
    const namesByHeuristic = new Map<string, string[]>();
    for (const rawName of rawNames) {
      const heuristic = normalizedByRaw.get(rawName) ?? cleanTitle(rawName);
      const key = heuristic.toLowerCase().replace(/\s+/g, ' ').trim();
      if (!key) {
        continue;
      }
      const bucket = namesByHeuristic.get(key);
      if (bucket) {
        bucket.push(rawName);
      } else {
        namesByHeuristic.set(key, [rawName]);
      }
    }

    // Each representative pairs the bucket's raw filename (used as the
    // storage key in `normalizedByRaw`) with the heuristic-cleaned title
    // we actually feed to the AI. Pre-cleaning means the model never sees
    // release noise, so it can spend its budget on the genuinely hard
    // cases (ambiguous abbreviations, foreign titles, etc.) rather than
    // re-discovering "1080p" isn't part of the show name.
    const representatives = [...namesByHeuristic.values()].map((bucket) => {
      const rawName = bucket[0];
      const heuristic = normalizedByRaw.get(rawName) ?? cleanTitle(rawName);
      return { rawName, heuristic };
    });
    const deadlineMs = Date.now() + this.maxNormalizationWindowMs;

    // Effective batch size for this scan. Starts at the configured size
    // and shrinks as we discover (via timeouts) what this model/host can
    // actually finish under the per-request timeout. Persisting the
    // learned size across iterations stops us paying a full timeout per
    // outer batch when the model is slow.
    const scanState = { effectiveBatchSize: this.batchSize };

    const totalRepresentatives = representatives.length;
    onProgress?.({ done: 0, total: totalRepresentatives });

    let cursor = 0;
    while (cursor < representatives.length) {
      if (Date.now() >= deadlineMs || Date.now() < this.aiBackoffUntil) {
        break;
      }

      const batch = representatives.slice(
        cursor,
        cursor + scanState.effectiveBatchSize,
      );
      const timedOut = await this.processBatchWithAdaptiveSplit(
        settings,
        batch,
        normalizedByRaw,
        deadlineMs,
        scanState,
      );
      if (timedOut) {
        // processBatchWithAdaptiveSplit has already armed the backoff;
        // stop attempting further batches in this scan.
        break;
      }
      cursor += batch.length;
      onProgress?.({ done: cursor, total: totalRepresentatives });
    }

    // Fan the representative's result out to the rest of its cluster so
    // every member of an identical-heuristic group gets the same title.
    for (const bucket of namesByHeuristic.values()) {
      const head = bucket[0];
      const resolved = normalizedByRaw.get(head);
      if (!resolved) {
        continue;
      }
      for (let i = 1; i < bucket.length; i += 1) {
        normalizedByRaw.set(bucket[i], resolved);
      }
    }

    return normalizedByRaw;
  }

  /**
   * Run a batch through the AI provider, splitting it in half on timeout
   * until we either succeed or shrink below {@link minAdaptiveBatchSize}.
   * Returns `true` if the provider is considered stuck (backoff armed) and
   * the caller should stop scheduling more work this scan.
   *
   * `scanState.effectiveBatchSize` is mutated downward whenever a split
   * succeeds, so the outer scan loop stops re-attempting batch sizes that
   * have already proven too large for this model/host combination.
   */
  private async processBatchWithAdaptiveSplit(
    settings: SystemSettings,
    batch: AiTitleBatchEntry[],
    normalizedByRaw: Map<string, string>,
    deadlineMs: number,
    scanState: { effectiveBatchSize: number },
  ): Promise<boolean> {
    if (batch.length === 0) {
      return false;
    }

    if (Date.now() >= deadlineMs || Date.now() < this.aiBackoffUntil) {
      return true;
    }

    const remainingMs = Math.max(1_000, deadlineMs - Date.now());

    try {
      const batchResults = await this.mediaAiTitleProviderService.requestAiTitleBatch(
        settings,
        batch,
        remainingMs,
      );
      for (const [rawName, aiTitle] of batchResults.entries()) {
        normalizedByRaw.set(rawName, aiTitle);
      }
      this.aiFailureLogged = false;
      return false;
    } catch (error) {
      if (!this.mediaAiTitleProviderService.isTimeoutError(error)) {
        this.handleBatchFailure(error);
        // Non-timeout errors don't indicate a stuck provider; let the
        // caller move on to the next batch.
        return false;
      }

      if (batch.length <= this.minAdaptiveBatchSize) {
        this.handleBatchFailure(error);
        return true;
      }

      this.logTimeoutSplit(batch.length);

      // Remember that this size doesn't work for the rest of the scan.
      const newCeiling = Math.max(
        this.minAdaptiveBatchSize,
        Math.floor(batch.length / 2),
      );
      if (newCeiling < scanState.effectiveBatchSize) {
        scanState.effectiveBatchSize = newCeiling;
      }

      const mid = Math.ceil(batch.length / 2);
      const stuck = await this.processBatchWithAdaptiveSplit(
        settings,
        batch.slice(0, mid),
        normalizedByRaw,
        deadlineMs,
        scanState,
      );
      if (stuck) {
        return true;
      }
      return this.processBatchWithAdaptiveSplit(
        settings,
        batch.slice(mid),
        normalizedByRaw,
        deadlineMs,
        scanState,
      );
    }
  }

  private logTimeoutSplit(batchSize: number): void {
    this.logger.debug?.(
      `AI title batch of ${batchSize} timed out; retrying with smaller chunks.`,
    );
  }

  private handleBatchFailure(error: unknown): void {
    if (!this.aiFailureLogged) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `AI title normalization unavailable. Falling back to heuristic title cleanup. ${message}`,
      );
      this.aiFailureLogged = true;
    }

    if (this.mediaAiTitleProviderService.isTimeoutError(error)) {
      this.aiBackoffUntil = Date.now() + this.aiBackoffDurationMs;
    }
  }
}
