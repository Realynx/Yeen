import { MediaPreviewResolver } from './media-preview.resolver';

describe('MediaPreviewResolver', () => {
  const resolver = new MediaPreviewResolver();
  const extractDescription = (raw: string): string | null =>
    (
      resolver as unknown as {
        extractDescriptionFromNfo: (value: string) => string | null;
      }
    ).extractDescriptionFromNfo(raw);

  it('extracts description from plot tag', () => {
    const raw = `
      <movie>
        <title>Example Movie</title>
        <plot><![CDATA[A former fighter returns home to protect his family.]]></plot>
      </movie>
    `;

    expect(extractDescription(raw)).toBe(
      'A former fighter returns home to protect his family.',
    );
  });

  it('falls back to overview tag when plot is missing', () => {
    const raw = `
      <movie>
        <title>Example Movie</title>
        <overview>When a secret archive is exposed, one detective follows the trail.</overview>
      </movie>
    `;

    expect(extractDescription(raw)).toBe(
      'When a secret archive is exposed, one detective follows the trail.',
    );
  });

  it('returns null for xml metadata dumps without narrative fields', () => {
    const raw = `
      <movie>
        <locked>false</locked>
        <dateadded>2025-12-28 07:01:19</dateadded>
        <title>Dragon Ball Super - BROLY Extras - Tokuten 2</title>
        <poster>/var/lib/jellyfin/metadata/library/32/321c9d783d12d6bd91467a1d899e7d7d/poster.jpg</poster>
        <codec>h264</codec>
        <bitrate>1290472</bitrate>
        <width>720</width>
        <height>480</height>
        <framerate>23.976027</framerate>
        <language>jpn</language>
        <scanprogressive>true</scanprogressive>
      </movie>
    `;

    expect(extractDescription(raw)).toBeNull();
  });

  it('uses plain text nfo descriptions when not xml', () => {
    const raw = `
      Three former rivals reunite after twenty years.
      They discover a missing map that points to a buried city.
    `;

    expect(extractDescription(raw)).toBe(
      'Three former rivals reunite after twenty years. They discover a missing map that points to a buried city.',
    );
  });
});
