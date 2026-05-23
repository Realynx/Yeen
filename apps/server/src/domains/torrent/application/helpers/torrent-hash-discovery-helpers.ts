export interface DiscoverTorrentHashByTagInput {
  tag: string;
  timeoutMs: number;
  pollIntervalMs: number;
  listTorrentsByTag: (tag: string) => Promise<unknown[]>;
  extractHash: (value: unknown) => string | null;
  onListError?: (error: unknown) => void;
  nowMs?: () => number;
  sleep?: (durationMs: number) => Promise<void>;
}

export async function discoverTorrentHashByTag(
  input: DiscoverTorrentHashByTagInput,
): Promise<string | null> {
  const nowMs = input.nowMs ?? Date.now;
  const sleep =
    input.sleep ??
    ((durationMs: number) =>
      new Promise<void>((resolveSleep) => {
        setTimeout(resolveSleep, durationMs);
      }));
  const deadline = nowMs() + input.timeoutMs;

  while (nowMs() < deadline) {
    try {
      const torrents = await input.listTorrentsByTag(input.tag);
      for (const raw of torrents) {
        const hash = input.extractHash(raw);
        if (hash) {
          return hash;
        }
      }
    } catch (error) {
      input.onListError?.(error);
    }

    await sleep(input.pollIntervalMs);
  }

  return null;
}
