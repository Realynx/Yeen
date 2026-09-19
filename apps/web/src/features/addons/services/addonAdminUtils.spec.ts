import { describe, expect, it } from 'vitest';
import {
  formatPackageSize,
  isZipPackage,
  restartPhaseIsActive,
  signatureStatusLabel,
} from './addonAdminUtils';

describe('add-on admin helpers', () => {
  it('accepts ZIP file names without trusting their casing', () => {
    expect(isZipPackage('downloader.zip')).toBe(true);
    expect(isZipPackage('Downloader.ZIP')).toBe(true);
    expect(isZipPackage('downloader.zip.exe')).toBe(false);
  });

  it('formats package sizes for the upload summary', () => {
    expect(formatPackageSize(0)).toBe('0 B');
    expect(formatPackageSize(1536)).toBe('1.5 KB');
    expect(formatPackageSize(12 * 1024 * 1024)).toBe('12 MB');
  });

  it('identifies restart phases that still need polling', () => {
    expect(restartPhaseIsActive('scheduled')).toBe(true);
    expect(restartPhaseIsActive('draining')).toBe(true);
    expect(restartPhaseIsActive('restarting')).toBe(true);
    expect(restartPhaseIsActive('failed')).toBe(false);
  });

  it('provides explicit signature labels', () => {
    expect(signatureStatusLabel('verified')).toBe('Signature verified');
    expect(signatureStatusLabel('unsigned')).toBe('Unsigned package');
    expect(signatureStatusLabel('invalid')).toBe('Invalid signature');
  });
});
