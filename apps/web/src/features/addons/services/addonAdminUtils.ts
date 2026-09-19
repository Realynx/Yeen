import type {
  AddonSignatureStatus,
  RuntimeRestartPhase,
} from '../../shared/services/types';

export const ADDON_PACKAGE_ACCEPT = '.zip,application/zip';

export function isZipPackage(fileName: string): boolean {
  return fileName.trim().toLowerCase().endsWith('.zip');
}

export function formatPackageSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes >= 10 ? 0 : 1)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
}

export function signatureStatusLabel(status: AddonSignatureStatus): string {
  switch (status) {
    case 'verified':
      return 'Signature verified';
    case 'unsigned':
      return 'Unsigned package';
    case 'invalid':
      return 'Invalid signature';
    default:
      return 'Signature unknown';
  }
}

export function restartPhaseIsActive(phase: RuntimeRestartPhase): boolean {
  return phase === 'scheduled' || phase === 'draining' || phase === 'restarting';
}
