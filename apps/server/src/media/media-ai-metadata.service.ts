import { Injectable, Logger } from '@nestjs/common';
import { basename, extname } from 'node:path';
import { SystemSettings } from '../system-settings/entities/system-settings.entity';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { cleanTitle } from './title-normalizer';

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

  constructor(private readonly systemSettingsService: SystemSettingsService) {}

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
      const heuristic =
        normalizedByRaw.get(rawName) ?? cleanTitle(rawName);
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
    batch: Array<{ rawName: string; heuristic: string }>,
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
      const batchResults = await this.requestAiTitleBatch(
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
      if (!this.isTimeoutError(error)) {
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

    if (this.isTimeoutError(error)) {
      this.aiBackoffUntil = Date.now() + this.aiBackoffDurationMs;
    }
  }

  private async requestAiTitleBatch(
    settings: SystemSettings,
    batch: Array<{ rawName: string; heuristic: string }>,
    budgetMs: number,
  ): Promise<Map<string, string>> {
    const systemPrompt = [
      'You refine already-cleaned media titles.',
      'Each input has had release noise (resolution, codec, source,',
      'release group, season/episode markers, brackets, years) stripped',
      'by a heuristic. Your job is ONLY to improve titles the heuristic',
      'could not handle perfectly: restore correct capitalization, fix',
      'spacing on proper nouns, recognize well-known works behind',
      'abbreviations or odd punctuation, and drop any residual junk the',
      'heuristic missed.',
      'Do NOT translate. Preserve proper nouns. Do NOT add years,',
      'subtitles, or extra words that are not present in the input.',
      'If the input already looks correct, copy it through unchanged.',
      'Examples:',
      '  "lotr fellowship of the ring" -> "The Lord of the Rings: The Fellowship of the Ring"',
      '  "the matrix" -> "The Matrix"',
      '  "foo bar" -> "Foo Bar"',
    ].join(' ');

    const heuristicInputs = batch.map((entry) => entry.heuristic);

    const userPrompt = [
      'Return strict JSON with shape {"results":[{"input":"...","title":"..."}]}.',
      'Every input must appear exactly once in results, in the same order.',
      'If you cannot improve an input, copy the input through as the title.',
      `inputs: ${JSON.stringify(heuristicInputs)}`,
    ].join('\n');

    // Per-batch timeout: respect the user's configured value (with a sane
    // floor) and only shrink it when the remaining normalisation budget
    // would otherwise be exceeded.
    const perBatchTimeoutMs = Math.min(
      Math.max(settings.aiRequestTimeoutMs, 15_000),
      budgetMs,
    );

    const rawResponse =
      settings.aiProvider === 'openai'
        ? await this.requestOpenAi(
            settings,
            systemPrompt,
            userPrompt,
            perBatchTimeoutMs,
          )
        : await this.requestOllama(
            settings,
            systemPrompt,
            userPrompt,
            heuristicInputs.length,
            perBatchTimeoutMs,
          );

    const byHeuristic = this.parseAiTitlePayload(rawResponse, heuristicInputs);

    // Hop from heuristic input back to the raw filename that is the
    // canonical key in `normalizedByRaw`. A missing entry just means we
    // keep the heuristic title already seeded for that raw name.
    const byRawName = new Map<string, string>();
    for (const entry of batch) {
      const aiTitle = byHeuristic.get(entry.heuristic);
      if (aiTitle) {
        byRawName.set(entry.rawName, aiTitle);
      }
    }
    return byRawName;
  }

  /**
   * Tolerant JSON parser for the model's reply. Accepts the canonical
   * `{ results: [{ input, title }] }` shape, plus common deviations (bare
   * array, `{ titles: { input: title } }`, or a flat `{ input: title }`
   * map). Anything unmatched is ignored — the caller already seeded the
   * heuristic fallback for every name, so a missing entry simply means
   * "keep the heuristic".
   */
  private parseAiTitlePayload(
    rawContent: string,
    expectedInputs: string[],
  ): Map<string, string> {
    const results = new Map<string, string>();
    const expectedSet = new Set(expectedInputs);

    let parsed: unknown;
    try {
      parsed = JSON.parse(this.stripCodeFence(rawContent));
    } catch {
      return results;
    }

    const acceptPair = (input: unknown, title: unknown) => {
      if (typeof input !== 'string' || !expectedSet.has(input)) {
        return;
      }
      if (typeof title !== 'string') {
        return;
      }
      const cleaned = title.trim();
      if (cleaned) {
        results.set(input, cleaned);
      }
    };

    const acceptList = (list: unknown[]) => {
      if (list.every((item) => typeof item === 'string')) {
        for (let i = 0; i < list.length; i += 1) {
          const input = expectedInputs[i];
          const value = list[i] as string;
          if (input && value.trim()) {
            results.set(input, value.trim());
          }
        }
        return;
      }
      for (const item of list) {
        if (item && typeof item === 'object') {
          const rec = item as Record<string, unknown>;
          const inputCandidate = rec.input ?? rec.original ?? rec.source;
          const titleCandidate = rec.title ?? rec.value ?? rec.name;
          acceptPair(inputCandidate, titleCandidate);
        }
      }
    };

    if (Array.isArray(parsed)) {
      acceptList(parsed);
      return results;
    }

    if (!parsed || typeof parsed !== 'object') {
      return results;
    }

    const payload = parsed as Record<string, unknown>;

    if (Array.isArray(payload.results)) {
      acceptList(payload.results);
      return results;
    }

    const titlesMap = payload.titles;
    if (titlesMap && typeof titlesMap === 'object') {
      for (const [key, value] of Object.entries(titlesMap)) {
        acceptPair(key, value);
      }
      return results;
    }

    // Last resort: treat the payload itself as { input: title }.
    for (const [key, value] of Object.entries(payload)) {
      acceptPair(key, value);
    }

    return results;
  }

  private async requestOllama(
    settings: SystemSettings,
    systemPrompt: string,
    userPrompt: string,
    expectedItems: number,
    timeoutMs: number,
  ): Promise<string> {
    const url = `${settings.aiOllamaBaseUrl.replace(/\/+$/, '')}/api/chat`;

    // ~60 tokens per item leaves headroom for JSON scaffolding and quoting.
    const predictedTokens = Math.max(192, Math.min(2_400, expectedItems * 60));

    const payload = {
      model: settings.aiModel,
      stream: false,
      // Pass a structural JSON schema instead of plain 'json' format so
      // the underlying llama.cpp grammar forces the model to emit an
      // object with a `results` array of exactly `expectedItems` entries,
      // each carrying both `input` and `title`. This stops small models
      // from collapsing the batch into a single object (or wandering
      // until num_predict runs out).
      format: {
        type: 'object',
        required: ['results'],
        additionalProperties: false,
        properties: {
          results: {
            type: 'array',
            minItems: expectedItems,
            maxItems: expectedItems,
            items: {
              type: 'object',
              required: ['input', 'title'],
              additionalProperties: false,
              properties: {
                input: { type: 'string' },
                title: { type: 'string' },
              },
            },
          },
        },
      },
      // Keep the model resident on the Ollama host so subsequent batches
      // (and subsequent scans within the hour) don't pay cold-load cost.
      keep_alive: '30m',
      options: {
        temperature: 0,
        num_predict: predictedTokens,
      },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };

    const response = (await this.fetchJson(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      timeoutMs,
    )) as { message?: { content?: string } };

    const content = response.message?.content?.trim();
    if (!content) {
      throw new Error('Ollama returned an empty response.');
    }

    return content;
  }

  private async requestOpenAi(
    settings: SystemSettings,
    systemPrompt: string,
    userPrompt: string,
    timeoutMs: number,
  ): Promise<string> {
    if (!settings.aiOpenAiApiKey.trim()) {
      throw new Error(
        'OpenAI provider selected but AI_OPENAI_API_KEY is empty.',
      );
    }

    const response = (await this.fetchJson(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.aiOpenAiApiKey}`,
        },
        body: JSON.stringify({
          model: settings.aiModel,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      },
      timeoutMs,
    )) as { choices?: Array<{ message?: { content?: string } }> };

    const content = response.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('OpenAI returned an empty response.');
    }

    return content;
  }

  private stripCodeFence(value: string): string {
    const trimmed = value.trim();
    if (!trimmed.startsWith('```')) {
      return trimmed;
    }
    return trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
  }

  private async fetchJson(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<unknown> {
    const abortController = new AbortController();
    const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          signal: abortController.signal,
        });
      } catch (error) {
        if (this.isAbortError(error)) {
          throw new Error(`AI request timed out after ${timeoutMs}ms`);
        }
        throw error;
      }

      if (!response.ok) {
        const raw = await response.text();
        throw new Error(
          `HTTP ${response.status} from AI provider: ${raw.slice(0, 280)}`,
        );
      }

      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private isAbortError(error: unknown): boolean {
    return (
      error instanceof DOMException &&
      (error.name === 'AbortError' ||
        error.message.toLowerCase().includes('aborted'))
    );
  }

  private isTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    return error.message.toLowerCase().includes('timed out');
  }
}
