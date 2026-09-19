export type SubtitlePreExtractionStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed';

export interface SubtitlePreExtractionProgress {
  jobId: string | null;
  status: SubtitlePreExtractionStatus;
  totalMediaItems: number;
  processedMediaItems: number;
  extractedTracks: number;
  existingTracks: number;
  unsupportedTracks: number;
  failedTracks: number;
  failedMediaItems: number;
  currentMediaTitle: string | null;
  message: string | null;
  error: string | null;
  lastFailure: string | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
}

export function createIdleSubtitlePreExtractionProgress(): SubtitlePreExtractionProgress {
  return {
    jobId: null,
    status: 'idle',
    totalMediaItems: 0,
    processedMediaItems: 0,
    extractedTracks: 0,
    existingTracks: 0,
    unsupportedTracks: 0,
    failedTracks: 0,
    failedMediaItems: 0,
    currentMediaTitle: null,
    message: null,
    error: null,
    lastFailure: null,
    startedAt: null,
    updatedAt: new Date().toISOString(),
    completedAt: null,
  };
}
