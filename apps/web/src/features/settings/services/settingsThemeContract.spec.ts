import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readStyle(relativePath: string) {
  return readFileSync(new URL(`../../../styles/${relativePath}`, import.meta.url), 'utf8');
}

describe('settings theme composition contract', () => {
  it('derives the shared settings palette from the selected theme tokens', () => {
    const css = readStyle('layouts/settings-shell.css');
    const compositionCss = readStyle('layouts/settings-admin-core.css');
    const settingsVariables = css.match(/\.settings-page-v2\s*\{([^}]+)\}/)?.[1] ?? '';

    expect(settingsVariables).toContain('--settings-card-bg: hsl(var(--card))');
    expect(settingsVariables).toContain('--settings-panel-muted: hsl(var(--muted-foreground))');
    expect(settingsVariables).toContain('--settings-title: hsl(var(--card-foreground))');
    expect(settingsVariables).toContain('--settings-accent-soft: hsl(var(--accent) / 0.12)');
    expect(compositionCss).toMatch(
      /\.user-settings-overview-card\s*\{[^}]*var\(--settings-primary-soft\)[^}]*var\(--settings-accent-soft\)/s,
    );
    expect(compositionCss).toMatch(
      /\.system-settings-nav-icon\s*\{[^}]*hsl\(var\(--primary\)\)/s,
    );
  });

  it('does not apply the current-theme workspace skin to alternate themes', () => {
    for (const file of ['themes/modern-shell.css', 'themes/modern-workspaces.css']) {
      const css = readStyle(file);

      expect(css).not.toMatch(/(^|\n)\.settings-page-v2:not\(\.settings-theme-light\)/);
      expect(css).toContain(":root[data-yeen-theme='current'] .settings-page-v2:not(.settings-theme-light)");
    }
  });

  it('gives contributed settings categories the same vertical rhythm as Core sections', () => {
    const css = readStyle('components/addon-host.css');
    const categoryGroup = css.match(/\.addon-settings-categories\s*\{([^}]+)\}/)?.[1] ?? '';
    const settingsSurface = css.match(
      /\[data-addon-surface\^='settings:'\]\s*\{([^}]+)\}/,
    )?.[1] ?? '';

    expect(categoryGroup).toMatch(/display:\s*grid/);
    expect(categoryGroup).toContain('gap: var(--settings-section-gap)');
    expect(settingsSurface).toMatch(/display:\s*block/);
    expect(settingsSurface).toMatch(/min-width:\s*0/);
  });
});
