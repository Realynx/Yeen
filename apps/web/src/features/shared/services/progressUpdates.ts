import type { ProgressEntry } from "./types";

const CHANNEL_NAME = "yeen-watch-progress-v1";

interface ProgressSubscriber {
  accountId: string;
  listener: (entry: ProgressEntry) => void;
}

const subscribers = new Set<ProgressSubscriber>();
let broadcastChannel: BroadcastChannel | null = null;

export function subscribeToProgressUpdates(
  accountId: string,
  listener: (entry: ProgressEntry) => void,
): () => void {
  const subscriber = { accountId: accountId.trim(), listener };
  subscribers.add(subscriber);
  ensureBroadcastChannel();

  return () => {
    subscribers.delete(subscriber);
    if (subscribers.size === 0) {
      broadcastChannel?.close();
      broadcastChannel = null;
    }
  };
}

export function publishProgressUpdate(entry: ProgressEntry): void {
  deliverProgressUpdate(entry);
  ensureBroadcastChannel();
  try {
    broadcastChannel?.postMessage(entry);
  } catch {
    // Live UI delivery must never turn a successful server write into a
    // playback progress error.
  }
}

function deliverProgressUpdate(entry: ProgressEntry): void {
  const accountId = progressAccountId(entry);
  if (!accountId || !entry.mediaId.trim()) {
    return;
  }

  for (const subscriber of subscribers) {
    if (subscriber.accountId === accountId) {
      try {
        subscriber.listener(entry);
      } catch {
        // One mounted surface must not block other account-scoped listeners.
      }
    }
  }
}

function ensureBroadcastChannel(): void {
  if (broadcastChannel || typeof BroadcastChannel === "undefined") {
    return;
  }

  try {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.addEventListener(
      "message",
      (event: MessageEvent<unknown>) => {
        if (isProgressEntry(event.data)) {
          deliverProgressUpdate(event.data);
        }
      },
    );
  } catch {
    broadcastChannel = null;
  }
}

function isProgressEntry(value: unknown): value is ProgressEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ProgressEntry>;
  return (
    typeof candidate.mediaId === "string" &&
    typeof candidate.positionSeconds === "number" &&
    typeof candidate.durationSeconds === "number" &&
    typeof candidate.completed === "boolean" &&
    typeof candidate.updatedAt === "string" &&
    Boolean(progressAccountId(candidate))
  );
}

function progressAccountId(
  entry: Pick<ProgressEntry, "accountId" | "userId">,
): string {
  return (entry.accountId ?? entry.userId ?? "").trim();
}
