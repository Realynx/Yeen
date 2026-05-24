import { Injectable } from '@nestjs/common';
import { SystemSettings } from '../../../../system-settings/domain/entities/system-settings.entity';

export interface AiTitleBatchEntry {
  rawName: string;
  heuristic: string;
}

@Injectable()
export class MediaAiTitleProviderService {
  async requestAiTitleBatch(
    settings: SystemSettings,
    batch: AiTitleBatchEntry[],
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

  isTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    return error.message.toLowerCase().includes('timed out');
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
          const value = list[i];
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
}
