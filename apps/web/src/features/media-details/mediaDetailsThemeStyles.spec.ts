import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sectionsCss = readFileSync(
  new URL('../../styles/components/media-details-sections.css', import.meta.url),
  'utf8',
);
const legacyDetailsCss = readFileSync(
  new URL('../../styles/layouts/details-legacy.css', import.meta.url),
  'utf8',
);
const tvShellCss = readFileSync(
  new URL('../../styles/layouts/tv-shell.css', import.meta.url),
  'utf8',
);
const netflixThemeCss = readFileSync(
  new URL('../../styles/themes/netflix-inspired.css', import.meta.url),
  'utf8',
);

function ruleBody(source: string, selector: string): string {
  const start = source.indexOf(`${selector} {`);
  expect(start, `missing CSS rule ${selector}`).toBeGreaterThanOrEqual(0);
  const bodyStart = source.indexOf('{', start) + 1;
  return source.slice(bodyStart, source.indexOf('}', bodyStart));
}

describe('media-details theme styles', () => {
  it('derives episode and series cards from selected-theme semantic tokens', () => {
    const cardStyles = [
      ruleBody(sectionsCss, '.episode-card'),
      ruleBody(sectionsCss, '.episode-card:hover'),
      ruleBody(sectionsCss, '.episode-card-thumb'),
      ruleBody(sectionsCss, '.series-card.is-current'),
    ].join('\n');

    expect(cardStyles).toContain('hsl(var(--card)');
    expect(cardStyles).toContain('hsl(var(--border)');
    expect(cardStyles).toContain('hsl(var(--primary)');
    expect(cardStyles).not.toMatch(/255,\s*(?:95|138|176),\s*(?:31|94)/);
    expect(cardStyles).not.toContain('#ffb482');
  });

  it('uses selected-theme tokens for collection card surfaces and artwork fallbacks', () => {
    const collectionStyles = [
      ruleBody(legacyDetailsCss, '.series-card'),
      ruleBody(legacyDetailsCss, '.series-card-thumb'),
    ].join('\n');

    expect(collectionStyles).toContain('hsl(var(--card)');
    expect(collectionStyles).toContain('hsl(var(--border)');
    expect(collectionStyles).toContain('hsl(var(--primary)');
    expect(collectionStyles).not.toMatch(/255,\s*95,\s*31/);
  });

  it('uses the selected-theme focus color for TV episode and series cards', () => {
    const focusRuleStart = tvShellCss.indexOf(
      ".tv-page-shell-details .episode-card:focus-visible",
    );
    expect(focusRuleStart).toBeGreaterThanOrEqual(0);
    const bodyStart = tvShellCss.indexOf('{', focusRuleStart) + 1;
    const focusStyles = tvShellCss.slice(bodyStart, tvShellCss.indexOf('}', bodyStart));

    expect(focusStyles).toContain('hsl(var(--primary)');
    expect(focusStyles).not.toMatch(/255,\s*176,\s*94/);
  });

  it('keeps Cinematic Red details actions compact while retaining theme styling', () => {
    const actionRuleStart = netflixThemeCss.indexOf(
      ".hero-actions-row :where(.play-cta, .ghost-button)",
    );
    expect(actionRuleStart).toBeGreaterThanOrEqual(0);
    const bodyStart = netflixThemeCss.indexOf('{', actionRuleStart) + 1;
    const actionStyles = netflixThemeCss.slice(
      bodyStart,
      netflixThemeCss.indexOf('}', bodyStart),
    );

    expect(actionStyles).toContain('min-height: 2.25rem');
    expect(actionStyles).toContain('font-size: 0.8rem');
    expect(actionStyles).toContain('border-radius: var(--radius)');
  });
});
