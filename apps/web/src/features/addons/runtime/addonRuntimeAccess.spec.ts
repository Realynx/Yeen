import { describe, expect, it } from 'vitest';
import { canAccessAddonContribution } from './addonRuntimeAccess';
import type { YeenAddonRoleCriteria } from './addonRuntime.types';

describe('add-on role access', () => {
  const downloaderAccess: YeenAddonRoleCriteria = {
    allowedRoles: ['administrator', 'downloader'],
  };

  it('maps legacy stored roles to public role terms', () => {
    expect(canAccessAddonContribution('admin', downloaderAccess)).toBe(true);
    expect(canAccessAddonContribution('sailer', downloaderAccess)).toBe(true);
    expect(canAccessAddonContribution('user', downloaderAccess)).toBe(false);
  });

  it('keeps adminOnly contributions backward compatible', () => {
    expect(canAccessAddonContribution('admin', { adminOnly: true })).toBe(true);
    expect(canAccessAddonContribution('sailer', { adminOnly: true })).toBe(false);
  });
});
