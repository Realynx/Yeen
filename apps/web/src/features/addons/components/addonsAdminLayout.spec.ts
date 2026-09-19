/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const addonAdminCss = readFileSync(
  new URL('../../../styles/components/addons-admin.css', import.meta.url),
  'utf8',
);

function ruleBody(selector: string): string {
  const ruleStart = addonAdminCss.indexOf(`${selector} {`);
  if (ruleStart < 0) {
    return '';
  }

  const bodyStart = addonAdminCss.indexOf('{', ruleStart) + 1;
  const bodyEnd = addonAdminCss.indexOf('}', bodyStart);
  return addonAdminCss.slice(bodyStart, bodyEnd);
}

describe('Add-ons admin layout', () => {
  it('lets the installer grid and page notices span the 12-column settings grid', () => {
    const body = ruleBody('.addons-admin-grid,\n.addons-admin-notice');

    expect(body).toMatch(/grid-column:\s*1\s*\/\s*-1/);
    expect(body).toMatch(/min-width:\s*0/);
  });

  it('allows the native package picker to shrink without overflowing its card', () => {
    const body = ruleBody(".addon-package-picker input[type='file']");

    expect(body).toMatch(/min-width:\s*0/);
    expect(body).toMatch(/width:\s*100%/);
  });

  it('resets settings card column spans inside the nested installer grid', () => {
    const body = ruleBody('.addons-admin-grid > .settings-surface');

    expect(body).toMatch(/grid-column:\s*auto/);
    expect(body).toMatch(/min-width:\s*0/);
  });
});
