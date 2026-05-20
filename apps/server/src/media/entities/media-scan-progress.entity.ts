export type MediaScanStatus = 'idle' | 'running' | 'completed' | 'failed';

export type MediaScanPhase =
  | 'idle'
  | 'collecting'
  | 'probing'
  | 'saving'
  | 'completed'
  | 'failed';

export interface MediaScanProgress {
  scanId: string | null;
  status: MediaScanStatus;
  phase: MediaScanPhase;
  libraryPaths: string[];
  totalFiles: number;
  processedFiles: number;
  indexedItems: number;
  failedFiles: number;
  currentFile: string | null;
  message: string | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
  scannedAt: string | null;
}

export function createIdleMediaScanProgress(): MediaScanProgress {
  const now = new Date().toISOString();

  return {
    scanId: null,
    status: 'idle',
    phase: 'idle',
    libraryPaths: [],
    totalFiles: 0,
    processedFiles: 0,
    indexedItems: 0,
    failedFiles: 0,
    currentFile: null,
    message: null,
    error: null,
    startedAt: null,
    updatedAt: now,
    completedAt: null,
    scannedAt: null,
  };
}
