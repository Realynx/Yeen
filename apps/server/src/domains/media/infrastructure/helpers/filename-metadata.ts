import {
  detectFromFilenameAndPathWith,
  parseEpisodeTitleFromFilenameWith,
} from './filename-detection-helpers';

/**
 * Pure helpers for extracting structured metadata (season, episode,
 * release year) from filenames and library-relative paths.
 *
 * Kept in its own module so the parsing rules are unit-testable in
 * isolation from the scanner, and so they can be reused by the AI
 * normaliser or any future renamer/organiser without dragging in the
 * NestJS dependency graph.
 *
 * Design notes
 * ------------
 * Season/episode information lives in a lot of places in the wild:
 *
 *   - Filename:   `Show.S01E02.mkv`, `Show.1x02.mkv`, `Show E02.mkv`,
 *                 `Show Episode 2.mkv`, `Show - 02.mkv` (anime),
 *                 `Show.205.mkv` (S02E05)
 *   - Folder:     `Show/Season 02/Episode 5.mkv`,
 *                 `Show/S2/05 - Title.mkv`, `Show/Saison 1/...`
 *
 * We try the strongest signals first (explicit `S##E##`), then fall back
 * to weaker ones (folder season + filename episode, anime-style "- 01",
 * 3-digit compact numbering). Each branch returns as soon as it has
 * confident data — partial matches still flow through so we can combine
 * "season from folder" with "episode from filename".
 */

export interface SeasonEpisodeResult {
  seasonNumber: number | null;
  episodeNumber: number | null;
  /**
   * True when the episode number was parsed as an absolute (anime-style)
   * episode index with no season context. Callers that need TMDB-style
   * S/E pairs can use this to decide whether to default the season to 1.
   */
  isAbsoluteEpisode: boolean;
}

/**
 * Combined result returned by `detectFromFilenameAndPath`, intended for
 * the "Detect from filename" action in the metadata editor.
 */
export interface FilenameDetectResult {
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeTitle: string | null;
  /**
   * Suggested media type derived from folder/filename analysis.
   * `null` means the detection could not make a type recommendation —
   * the caller should leave the current type unchanged.
   */
  suggestedType: 'show' | 'other' | null;
}

const EMPTY: SeasonEpisodeResult = {
  seasonNumber: null,
  episodeNumber: null,
  isAbsoluteEpisode: false,
};

/**
 * Parse season + episode from a filename (without extension), optionally
 * combining with hints from the library-relative path.
 */
export function parseSeasonEpisode(
  fileName: string,
  relativePath?: string,
): SeasonEpisodeResult {
  const seasonFromPath = parseSeasonFromPath(relativePath ?? '');
  const parsers = [
    () => parseStrongSeasonEpisode(fileName),
    () => parseEpisodeOnly(fileName, seasonFromPath),
    () => parseAnimeEpisode(fileName, seasonFromPath),
    () => parseSeasonContextEpisode(fileName, seasonFromPath),
  ];
  for (const parse of parsers) {
    const result = parse();
    if (result) return result;
  }
  return seasonFromPath === null ? EMPTY : seasonOnly(seasonFromPath);
}

function parseStrongSeasonEpisode(
  fileName: string,
): SeasonEpisodeResult | null {
  const patterns = [
    /s(\d{1,2})[\s._-]?e(\d{1,3})/i,
    /\b(\d{1,2})x(\d{1,3})\b/i,
    /season[\s._-]*(\d{1,2})[\s._-]+episode[\s._-]*(\d{1,3})/i,
  ];
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) return seasonEpisode(toInt(match[1]), toInt(match[2]), false);
  }
  return null;
}

function parseEpisodeOnly(
  fileName: string,
  seasonFromPath: number | null,
): SeasonEpisodeResult | null {
  const match = fileName.match(
    /(?:^|[\s._-])(?:e|ep|episode)[\s._-]*(\d{1,3})\b/i,
  );
  return match
    ? seasonEpisode(seasonFromPath, toInt(match[1]), seasonFromPath === null)
    : null;
}

function parseAnimeEpisode(
  fileName: string,
  seasonFromPath: number | null,
): SeasonEpisodeResult | null {
  const match = fileName.match(/[\s._]-[\s._](\d{1,4})(?:v\d+)?(?:[\s._-]|$)/);
  const value = match ? toInt(match[1]) : null;
  if (value === null || value <= 0 || value >= 2000) return null;
  return seasonEpisode(seasonFromPath, value, seasonFromPath === null);
}

function parseSeasonContextEpisode(
  fileName: string,
  seasonFromPath: number | null,
): SeasonEpisodeResult | null {
  if (seasonFromPath === null) return null;
  return (
    parseLeadingEpisode(fileName, seasonFromPath) ??
    parseCompactContextEpisode(fileName, seasonFromPath)
  );
}

function parseLeadingEpisode(
  fileName: string,
  season: number,
): SeasonEpisodeResult | null {
  const match = fileName.match(/^(\d{1,3})(?:[\s._-]|$)/);
  const value = match ? toInt(match[1]) : null;
  return value !== null && value > 0
    ? seasonEpisode(season, value, false)
    : null;
}

function parseCompactContextEpisode(
  fileName: string,
  season: number,
): SeasonEpisodeResult | null {
  const match = fileName.match(/(?:^|[\s._-])(\d{3,4})(?:[\s._-]|$)/);
  const value = match ? toInt(match[1]) : null;
  if (value === null || value < 100 || value >= 5000) return null;
  const compact = splitCompactEpisode(value);
  if (compact?.seasonNumber === season) return compact;
  return seasonEpisode(season, value % 100 || value, false);
}

function seasonEpisode(
  seasonNumber: number | null,
  episodeNumber: number | null,
  isAbsoluteEpisode: boolean,
): SeasonEpisodeResult {
  return { seasonNumber, episodeNumber, isAbsoluteEpisode };
}

function seasonOnly(seasonNumber: number): SeasonEpisodeResult {
  return seasonEpisode(seasonNumber, null, false);
}

/**
 * Parse a release year from a filename. Prefers the LAST year token
 * appearing before the first release-noise token, because for titles
 * like "Blade Runner 2049 (2017)" the second year is the real release
 * year. Returns null when the only year sits at position 0 (the year is
 * the title itself, e.g. "1917", "1984").
 */
export function parseReleaseYear(fileName: string): number | null {
  const cleaned = fileName
    .replace(/\[[^\]]*\]|\{[^}]*\}/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  // Year inside parentheses is a very strong signal — most renamers
  // wrap the release year in parens ("Movie Title (2017).mkv").
  const parenMatches = [...cleaned.matchAll(/\((\d{4})\)/g)]
    .map((m) => toInt(m[1]))
    .filter((y): y is number => y !== null && isPlausibleYear(y));
  if (parenMatches.length > 0) {
    return parenMatches[parenMatches.length - 1];
  }

  // Strip parenthesised junk now that we've extracted any year inside.
  const flat = cleaned
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = flat.split(' ');

  const yearsBeforeNoise: { value: number; index: number }[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (isHardNoiseToken(token)) break;
    if (/^(19\d{2}|20\d{2})$/.test(token)) {
      const value = toInt(token);
      if (value !== null && isPlausibleYear(value)) {
        yearsBeforeNoise.push({ value, index: i });
      }
    }
  }

  if (yearsBeforeNoise.length === 0) return null;

  // If the ONLY year sits at index 0, it's almost certainly the title
  // (e.g. "1917.1080p.BluRay") — refuse to claim it as a release year.
  if (yearsBeforeNoise.length === 1 && yearsBeforeNoise[0].index === 0) {
    return null;
  }

  return yearsBeforeNoise[yearsBeforeNoise.length - 1].value;
}

/**
 * Walk the path segments looking for a folder that encodes a season,
 * e.g. "Season 02", "Season.02", "S01", "Series 1", "Saison 1".
 * Also maps "Specials" / "Special" folders to season 0 — the conventional
 * season number used by TVDB/TMDB for specials that don't belong to a
 * numbered season.
 */
function parseSeasonFromPath(relativePath: string): number | null {
  if (!relativePath) return null;
  const segments = relativePath.split(/[/\\]/);

  // Walk from deepest to shallowest so the closest season folder wins
  // when nested (e.g. ".../Show/Specials/Season 1/...").
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const segment = segments[i];
    if (!segment) continue;

    const verbose = segment.match(
      /^(?:season|series|saison|temporada|staffel)[\s._-]*(\d{1,2})\b/i,
    );
    if (verbose) return toInt(verbose[1]);

    const short = segment.match(/^s(\d{1,2})$/i);
    if (short) return toInt(short[1]);

    // "Specials" / "Special" → season 0 (conventional specials bucket)
    if (/^specials?$/i.test(segment)) return 0;
  }

  return null;
}

/**
 * "105" → S01E05, "1205" → S12E05. Returns null when the implied season
 * is zero (which would be a Specials folder convention better handled
 * by the explicit folder rules).
 */
function splitCompactEpisode(value: number): SeasonEpisodeResult | null {
  const season = Math.floor(value / 100);
  const episode = value % 100;
  if (season < 1 || season > 50) return null;
  if (episode < 1 || episode > 99) return null;
  return {
    seasonNumber: season,
    episodeNumber: episode,
    isAbsoluteEpisode: false,
  };
}

/**
 * Tokens that unambiguously mark the start of release-metadata noise.
 * Kept deliberately small — see title-normalizer for the wider list. We
 * only need enough here to anchor the "year must appear before noise"
 * rule.
 */
function isHardNoiseToken(token: string): boolean {
  return (
    /^(2160p|1440p|1080p|720p|576p|480p|360p|4k|uhd)$/i.test(token) ||
    /^(x264|x265|h\.?26[45]|hevc|av1|xvid|divx|vp9)$/i.test(token) ||
    /^(bluray|blu-ray|brrip|bdrip|bdremux|webrip|web-rip|webdl|web-dl|hdrip|hdtv|dvdrip|dvdscr|remux)$/i.test(
      token,
    ) ||
    /^(s\d{1,2}e\d{1,3}|s\d{1,2}|\d{1,2}x\d{1,3})$/i.test(token)
  );
}

function isPlausibleYear(year: number): boolean {
  return year >= 1900 && year <= 2099;
}

function toInt(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseEpisodeTitleFromFilename(fileName: string): string | null {
  return parseEpisodeTitleFromFilenameWith(fileName, isHardNoiseToken);
}

// ---------------------------------------------------------------------------
// Combined filename detection (used by the metadata editor)
// ---------------------------------------------------------------------------

/**
 * Derive season, episode, episode title and a type suggestion from a
 * filename and its library-relative path.
 *
 * This is the entry point used by the "Detect from filename" editor action.
 * It extends the base `parseSeasonEpisode` with:
 *  - Recognition of "Specials" / "Special" folders → season 0
 *  - Recognition of extras folders → `suggestedType: 'other'`
 *  - Episode title extraction via `parseEpisodeTitleFromFilename`
 */
export function detectFromFilenameAndPath(
  fileName: string,
  relativePath?: string,
): FilenameDetectResult {
  return detectFromFilenameAndPathWith(
    fileName,
    relativePath,
    parseSeasonEpisode,
    parseEpisodeTitleFromFilename,
  );
}
