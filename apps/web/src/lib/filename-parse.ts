/**
 * Lightweight client-side mirror of the server-side `parseSeasonEpisode`
 * helper used by the admin "Assign to Series" UI to suggest per-file
 * season/episode numbers based on the source filename + path. Kept
 * intentionally simple: detects the strongest signals only (S##E##,
 * Season folder + episode digits, anime-style "- 01"). Falls back to
 * `null` so the dialog can sequentially number unmatched items.
 */

export interface ParsedSeasonEpisode {
  seasonNumber: number | null;
  episodeNumber: number | null;
  isAbsoluteEpisode: boolean;
}

const EMPTY: ParsedSeasonEpisode = {
  seasonNumber: null,
  episodeNumber: null,
  isAbsoluteEpisode: false,
};

function toInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSeasonFromPath(relativePath: string): number | null {
  if (!relativePath) return null;
  const segments = relativePath.split(/[/\\]/).slice(0, -1);
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];

    // "Specials" / "Special" → season 0
    if (/^specials?$/i.test(seg)) return 0;

    const m =
      seg.match(/^(?:season|saison|series|series\s*-)\s*(\d{1,2})$/i) ??
      seg.match(/^s(\d{1,2})$/i);
    if (m) {
      const value = toInt(m[1]);
      if (value !== null) return value;
    }
  }
  return null;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{1,5}$/i, '');
}

export function parseSeasonEpisodeFromPath(
  relativePath: string,
): ParsedSeasonEpisode {
  if (!relativePath) return EMPTY;

  const fileName = stripExtension(
    relativePath.split(/[/\\]/).pop() ?? relativePath,
  );

  const standard = fileName.match(/s(\d{1,2})[\s._-]?e(\d{1,3})/i);
  if (standard) {
    return {
      seasonNumber: toInt(standard[1]),
      episodeNumber: toInt(standard[2]),
      isAbsoluteEpisode: false,
    };
  }

  const altMatch = fileName.match(/\b(\d{1,2})x(\d{1,3})\b/i);
  if (altMatch) {
    return {
      seasonNumber: toInt(altMatch[1]),
      episodeNumber: toInt(altMatch[2]),
      isAbsoluteEpisode: false,
    };
  }

  const verbose = fileName.match(
    /season[\s._-]*(\d{1,2})[\s._-]+episode[\s._-]*(\d{1,3})/i,
  );
  if (verbose) {
    return {
      seasonNumber: toInt(verbose[1]),
      episodeNumber: toInt(verbose[2]),
      isAbsoluteEpisode: false,
    };
  }

  const seasonFromPath = parseSeasonFromPath(relativePath);

  const episodeOnly = fileName.match(
    /(?:^|[\s._-])(?:e|ep|episode)[\s._-]*(\d{1,3})\b/i,
  );
  if (episodeOnly) {
    return {
      seasonNumber: seasonFromPath,
      episodeNumber: toInt(episodeOnly[1]),
      isAbsoluteEpisode: seasonFromPath === null,
    };
  }

  const animeDash = fileName.match(
    /[\s._]-[\s._](\d{1,4})(?:v\d+)?(?:[\s._-]|$)/,
  );
  if (animeDash) {
    const value = toInt(animeDash[1]);
    if (value !== null && value > 0 && value < 2000) {
      return {
        seasonNumber: seasonFromPath,
        episodeNumber: value,
        isAbsoluteEpisode: seasonFromPath === null,
      };
    }
  }

  if (seasonFromPath !== null) {
    const leading = fileName.match(/^(\d{1,3})(?:[\s._-]|$)/);
    if (leading) {
      const value = toInt(leading[1]);
      if (value !== null && value > 0) {
        return {
          seasonNumber: seasonFromPath,
          episodeNumber: value,
          isAbsoluteEpisode: false,
        };
      }
    }

    const compact = fileName.match(/(?:^|[\s._-])(\d{3,4})(?:[\s._-]|$)/);
    if (compact) {
      const value = toInt(compact[1]);
      if (value !== null && value >= 100 && value < 5000) {
        const season = Math.floor(value / 100);
        const episode = value % 100;
        if (episode > 0 && season === seasonFromPath) {
          return {
            seasonNumber: season,
            episodeNumber: episode,
            isAbsoluteEpisode: false,
          };
        }
      }
    }

    return {
      seasonNumber: seasonFromPath,
      episodeNumber: null,
      isAbsoluteEpisode: false,
    };
  }

  return EMPTY;
}
