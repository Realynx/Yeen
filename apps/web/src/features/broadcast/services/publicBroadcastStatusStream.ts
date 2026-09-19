import { absoluteApiUrl } from '../../shared/services/api';
import type { BroadcastPublicSession } from '../../shared/services/types';

export function parsePublicBroadcastStatusEvent(
  eventData: string,
): BroadcastPublicSession | null {
  try {
    const parsed = JSON.parse(eventData) as Partial<BroadcastPublicSession>;
    if (
      typeof parsed.enabled !== 'boolean'
      || typeof parsed.isLive !== 'boolean'
      || typeof parsed.sourceEpoch !== 'number'
      || typeof parsed.shareToken !== 'string'
    ) {
      return null;
    }
    return parsed as BroadcastPublicSession;
  } catch {
    return null;
  }
}

export function openPublicBroadcastStatusStream(
  shareToken: string,
  onStatus: (status: BroadcastPublicSession) => void,
): () => void {
  const url = absoluteApiUrl(
    `/api/broadcast/public/${encodeURIComponent(shareToken)}/events`,
  );
  const source = new EventSource(url);
  source.onmessage = (event) => {
    const status = parsePublicBroadcastStatusEvent(event.data);
    if (status) {
      onStatus(status);
    }
  };
  return () => source.close();
}
