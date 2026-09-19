import type { ProgressEntry } from "../../shared/services/types";

export class HomeFeedRefreshCoordinator<T> {
  private latestGeneration = 0;

  async run(
    load: () => Promise<T>,
    apply: (value: T) => void,
  ): Promise<boolean> {
    const generation = ++this.latestGeneration;
    const value = await load();
    if (generation !== this.latestGeneration) {
      return false;
    }

    apply(value);
    return true;
  }

  invalidate(): void {
    this.latestGeneration += 1;
  }
}

export function mergeProgressEntries(
  current: readonly ProgressEntry[],
  incoming: readonly ProgressEntry[],
  accountId?: string,
): ProgressEntry[] {
  const normalizedAccountId = accountId?.trim() ?? "";
  const merged = new Map<string, ProgressEntry>();
  for (const entry of current) {
    if (
      normalizedAccountId &&
      progressAccountId(entry) !== normalizedAccountId
    ) {
      continue;
    }
    merged.set(progressIdentity(entry), entry);
  }

  for (const entry of incoming) {
    if (
      normalizedAccountId &&
      progressAccountId(entry) !== normalizedAccountId
    ) {
      continue;
    }
    const key = progressIdentity(entry);
    const existing = merged.get(key);
    if (!existing || compareProgressFreshness(entry, existing) >= 0) {
      merged.set(key, entry);
    }
  }

  return [...merged.values()].sort((left, right) =>
    compareProgressFreshness(right, left),
  );
}

function progressIdentity(entry: ProgressEntry): string {
  return `${progressAccountId(entry)}\u0000${entry.mediaId}`;
}

function progressAccountId(entry: ProgressEntry): string {
  return (entry.accountId ?? entry.userId ?? "").trim();
}

function compareProgressFreshness(
  left: ProgressEntry,
  right: ProgressEntry,
): number {
  const leftSync = validTimestamp(left.syncTimestampMs);
  const rightSync = validTimestamp(right.syncTimestampMs);
  if (leftSync !== null && rightSync !== null && leftSync !== rightSync) {
    return leftSync - rightSync;
  }

  return timestampFromIso(left.updatedAt) - timestampFromIso(right.updatedAt);
}

function validTimestamp(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function timestampFromIso(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
