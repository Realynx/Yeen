import { describe, expect, it } from 'vitest';
import {
  normalizeBitrateInput,
  normalizeInvitesInput,
  toAccountRoleLabel,
} from './adminAccountsViewUtils';

describe('adminAccountsViewUtils', () => {
  it('uses Account domain labels without exposing persistence role codes', () => {
    expect(toAccountRoleLabel('admin')).toBe('Administrator');
    expect(toAccountRoleLabel('sailer')).toBe('Downloader');
    expect(toAccountRoleLabel('user')).toBe('Standard Account');
  });

  it('normalizes numeric account limits', () => {
    expect(normalizeInvitesInput('-4')).toBe(0);
    expect(normalizeBitrateInput('100')).toBe(250);
    expect(normalizeBitrateInput('')).toBeNull();
  });
});
