interface SeasonEpisodeResultLike {
  seasonNumber: number | null;
  episodeNumber: number | null;
}

interface FilenameDetectResultLike {
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  suggestedType: 'show' | 'other' | null;
}

type NoiseTokenPredicate = (token: string) => boolean;

type SeasonEpisodeParser = (
  fileName: string,
  relativePath?: string,
) => SeasonEpisodeResultLike;

const SPECIALS_FOLDER_NAMES = new Set(['specials', 'special']);

const EXTRAS_FOLDER_NAMES = new Set([
  'extras',
  'extra',
  'featurettes',
  'featurette',
  'behind the scenes',
  'behindthescenes',
  'deleted scenes',
  'deletedscenes',
  'deleted',
  'interviews',
  'interview',
  'trailers',
  'trailer',
  'shorts',
  'short',
  'clips',
  'clip',
  'scenes',
  'sample',
  'samples',
]);

export function parseEpisodeTitleFromFilenameWith(
  fileName: string,
  isHardNoiseToken: NoiseTokenPredicate,
): string | null {
  let afterMarker: string | null = null;

  // S##E## / S##.E## / S##_E##
  const standardMatch = fileName.match(/s\d{1,2}[\s._-]?e\d{1,3}(.*)/i);
  if (standardMatch) {
    afterMarker = standardMatch[1];
  }

  // ##x##
  if (afterMarker === null) {
    const altMatch = fileName.match(/\b\d{1,2}x\d{1,3}(.*)/i);
    if (altMatch) {
      afterMarker = altMatch[1];
    }
  }

  // "Season 1 Episode 2" verbose form
  if (afterMarker === null) {
    const verboseMatch = fileName.match(
      /season[\s._-]*\d{1,2}[\s._-]+episode[\s._-]*\d{1,3}(.*)/i,
    );
    if (verboseMatch) {
      afterMarker = verboseMatch[1];
    }
  }

  // Anime "- 01" — capture text after the bare number
  if (afterMarker === null) {
    const animeMatch = fileName.match(/[\s._]-[\s._]\d{1,4}(?:v\d+)?(.*)/);
    if (animeMatch) {
      afterMarker = animeMatch[1];
    }
  }

  if (afterMarker === null) {
    return null;
  }

  // Normalize: strip leading separators, collapse dots/underscores to spaces
  let cleaned = afterMarker
    .replace(/^[\s._-]+/, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return null;
  }

  // Strip anything from a leading bracket/paren (resolution, group tags ...)
  cleaned = cleaned.replace(/[\[(].*$/, '').trim();

  // Truncate at the first hard-noise token (resolution, codec, source)
  const tokens = cleaned.split(/\s+/);
  const noiseIdx = tokens.findIndex((t) => isHardNoiseToken(t));
  if (noiseIdx === 0) {
    return null;
  }
  if (noiseIdx > 0) {
    cleaned = tokens.slice(0, noiseIdx).join(' ').trim();
  }

  return cleaned || null;
}

export function detectFromFilenameAndPathWith(
  fileName: string,
  relativePath: string | undefined,
  parseSeasonEpisode: SeasonEpisodeParser,
  parseEpisodeTitleFromFilename: (fileName: string) => string | null,
): FilenameDetectResultLike {
  const { isSpecials, isExtras } = classifyPathFolders(relativePath ?? '');

  if (isExtras) {
    return {
      seasonNumber: null,
      episodeNumber: null,
      episodeTitle: null,
      suggestedType: 'other',
    };
  }

  const se = parseSeasonEpisode(fileName, relativePath);
  let { seasonNumber, episodeNumber } = se;

  // Files inside a "Specials" folder with no explicit S00E## marker
  // should default to season 0 (the conventional specials season).
  if (isSpecials && seasonNumber === null) {
    seasonNumber = 0;
  }

  const episodeTitle = parseEpisodeTitleFromFilename(fileName);
  const suggestedType =
    seasonNumber !== null || episodeNumber !== null ? 'show' : null;

  return {
    seasonNumber,
    episodeNumber,
    episodeTitle,
    suggestedType,
  };
}

function classifyPathFolders(relativePath: string): {
  isSpecials: boolean;
  isExtras: boolean;
} {
  const segments = relativePath
    .split(/[/\\]/)
    .map((s) => s.toLowerCase().trim().replace(/[._]+/g, ' '));

  const isSpecials = segments.some((s) => SPECIALS_FOLDER_NAMES.has(s));
  const isExtras = segments.some((s) => EXTRAS_FOLDER_NAMES.has(s));
  return { isSpecials, isExtras };
}
