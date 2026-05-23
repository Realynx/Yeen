import type { MediaScanProgress } from '../../shared/services/types';

export function formatScanPhase(phase: string): string {
  switch (phase) {
    case 'collecting':
      return 'Collecting files';
    case 'probing':
      return 'Analyzing media';
    case 'saving':
      return 'Saving index';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return 'Idle';
  }
}

export function formatScanStatus(status: string): string {
  switch (status) {
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return 'Idle';
  }
}

export function getScanProgressPercent(
  scanProgress: MediaScanProgress | null,
): number {
  if (scanProgress && scanProgress.totalFiles > 0) {
    return Math.min(
      100,
      Math.round((scanProgress.processedFiles / scanProgress.totalFiles) * 100),
    );
  }

  return scanProgress?.status === 'completed' ? 100 : 0;
}

export function getActiveScan(
  scanProgress: MediaScanProgress | null,
): MediaScanProgress | null {
  return scanProgress && scanProgress.status !== 'idle' ? scanProgress : null;
}
