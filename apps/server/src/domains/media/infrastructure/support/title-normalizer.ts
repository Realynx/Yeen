/**
 * Shared helpers for turning raw filenames into display titles and stable
 * dedupe keys. Centralising this logic ensures the heuristic fallback used
 * when AI normalisation is unavailable agrees with the keys used at probe
 * time, scan-completion dedupe, and TMDB lookup grouping.
 *
 * Cleaning strategy
 * -----------------
 * Scene-style filenames follow a very consistent shape:
 *
 *     <Title tokens> [<Year>] <Release noise>+ [-<Group>]
 *
 * The most reliable signal is therefore the position of the FIRST token
 * that is unmistakably release noise (`1080p`, `BluRay`, `S01E02`, …) or
 * a release year. Everything before that boundary is the title.
 *
 * This is far more accurate than the older "remove every known noise
 * token regardless of position" approach because real titles routinely
 * collide with single-word release tags ("Charlotte's *Web*", "*Cam*",
 * "*HD*"), and several beloved movies *are* a year ("1917", "1984",
 * "2001 A Space Odyssey", "Blade Runner 2049").
 */

const BRACKETED = /\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g;
const YEAR_TOKEN = /^(19\d{2}|20\d{2})$/;
const SEASON_EPISODE_TOKEN =
  /^(?:s\d{1,2}(?:e\d{1,3})?|\d{1,2}x\d{1,3}|e\d{1,3}|ep\d{1,3}|season|episode|complete)$/i;

// Tokens that, when seen as a standalone word, mean "from here on it's
// release metadata". Intentionally narrow: we only list things that
// effectively NEVER appear inside real titles. Generic words like
// `web`, `hd`, `cam`, `ts`, `bd`, `dvd` are deliberately excluded — they
// collide too often with real titles ("Charlotte's Web", "Cam", …) and
// the position-based cut already catches them via an adjacent year or a
// truly unambiguous noise token like `1080p`.
const NOISE_TOKENS = new Set<string>([
  // resolutions
  '2160p',
  '1440p',
  '1080p',
  '900p',
  '720p',
  '576p',
  '480p',
  '360p',
  '4k',
  'uhd',
  // sources (only compound / unambiguous forms)
  'webdl',
  'web-dl',
  'webrip',
  'web-rip',
  'bluray',
  'blu-ray',
  'brrip',
  'bdrip',
  'bdremux',
  'dvdrip',
  'dvdscr',
  'hdrip',
  'hdtv',
  'pdtv',
  'sdtv',
  'hdcam',
  'hdts',
  'telesync',
  'telecine',
  // video codecs
  'x264',
  'x265',
  'h264',
  'h265',
  'h.264',
  'h.265',
  'hevc',
  'avc',
  'xvid',
  'divx',
  'av1',
  'vp9',
  'mpeg2',
  'mpeg-2',
  // bit depth / hdr
  '10bit',
  '8bit',
  '10-bit',
  '8-bit',
  'hdr',
  'hdr10',
  'hdr10+',
  'dovi',
  'dolbyvision',
  'sdr',
  // audio
  'aac',
  'aac2.0',
  'aac5.1',
  'ac3',
  'eac3',
  'dd5.1',
  'ddp5.1',
  'ddp',
  'dd+',
  'dts',
  'dts-hd',
  'dtshd',
  'dts-hd.ma',
  'dts-x',
  'truehd',
  'atmos',
  'flac',
  'opus',
  'mp3',
  // release modifiers
  'remux',
  'proper',
  'repack',
  'extended',
  'uncut',
  'unrated',
  'remastered',
  'restored',
  "director's",
  'directors',
  'theatrical',
  'imax',
  'multi',
  'dual',
  'subbed',
  'dubbed',
  'subs',
  'dubs',
  'limited',
  'internal',
  'rerip',
  'retail',
  // distributors / platforms
  'amzn',
  'nf',
  'netflix',
  'dsnp',
  'disney+',
  'dsny',
  'hulu',
  'hmax',
  'hbo',
  'atvp',
  'appletv',
  'pcok',
  'peacock',
  'pmtp',
  'paramount+',
  'itunes',
  'crav',
  'stan',
  'funi',
  'funimation',
  'crunchyroll',
]);

// Composite patterns that need a regex (variable separators / suffixes).
// Each pattern anchors to the whole token so we never partial-match real
// title words.
const NOISE_PATTERNS: RegExp[] = [
  /^web[._-]?(?:dl|rip)$/i,
  /^blu[._-]?ray$/i,
  /^10[._-]?bit$/i,
  /^8[._-]?bit$/i,
  /^h[._-]?26[45]$/i,
  /^dts[._-]?hd(?:[._-]?ma)?$/i,
  /^dd[p]?[._-]?[257][._-]?[01]$/i, // dd5.1, ddp5.1, dd7.1, dd2.0
  /^aac[._-]?[257][._-]?[01]$/i,
  /^[257][._-][01]ch$/i, // 5.1ch, 7.1ch
  /^hdr10\+?$/i,
];

const PUNCT_TO_SPACE = /[._]+/g;
const WHITESPACE_RUN = /\s+/g;
const LEADING_TRAILING_JUNK = /^[\s\-_.,:;|]+|[\s\-_.,:;|]+$/g;

// For dedupe-key normalisation only. Article stripping must stay scoped
// to dedupe — do NOT reuse this for provider/title matching, which needs
// exact-title folding (see memory note on TMDB matching).
const LEADING_ARTICLES = /^(?:the|a|an)\s+/i;
const TRAILING_ARTICLES = /,\s*(?:the|a|an)\s*$/i;

/**
 * True when `token` looks unambiguously like release metadata.
 */
function isNoiseToken(token: string): boolean {
  if (!token) return false;
  const lower = token.toLowerCase();
  if (NOISE_TOKENS.has(lower)) return true;
  if (SEASON_EPISODE_TOKEN.test(token)) return true;
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(token)) return true;
  }
  return false;
}

function isYearToken(token: string): boolean {
  return YEAR_TOKEN.test(token);
}

/**
 * Trailing scene release-group suffix on a single title token, e.g.
 * `Movie-GROUP`, `Movie-NTb`, `Movie-YIFY`, `Movie-x264`. We deliberately
 * require at least two uppercase letters OR a digit in the suffix so we
 * never strip a real hyphenated title word ("Spider-Man", "Ant-Man",
 * "X-Men", "Spider-Woman").
 */
function stripTrailingGroupSuffix(token: string): string {
  const match = token.match(/^(.+?)-([A-Za-z0-9]{2,})$/);
  if (!match) return token;
  const suffix = match[2];
  const looksLikeGroup = /[A-Z]{2,}/.test(suffix) || /\d/.test(suffix);
  return looksLikeGroup ? match[1] : token;
}

/**
 * Tokenise a scene-style filename and return the title portion (the
 * tokens before the first noise/year boundary). Brackets are stripped
 * first because they are almost always release tags ("[1080p]",
 * "(2020)", "{REMUX}"); content like "(Director's Cut)" is therefore
 * also discarded, which matches what users want for dedupe and TMDB
 * lookups.
 */
function extractTitleTokens(rawName: string): string[] {
  const withoutBrackets = rawName.replace(BRACKETED, ' ');
  const normalised = withoutBrackets
    .replace(PUNCT_TO_SPACE, ' ')
    .replace(WHITESPACE_RUN, ' ')
    .trim();

  if (!normalised) return [];

  const tokens = normalised.split(' ');
  let cut = tokens.length;
  let sawLeadingYear = false;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (isNoiseToken(token)) {
      cut = i;
      break;
    }

    if (isYearToken(token)) {
      const next = tokens[i + 1];

      // Two consecutive years: the first is part of the title (e.g.
      // "Blade Runner 2049 2017 1080p"), the second is the release year.
      if (next && isYearToken(next) && !sawLeadingYear) {
        sawLeadingYear = true;
        continue;
      }

      // Year at the very start might BE the title ("1917", "1984",
      // "2001 A Space Odyssey"). Keep scanning and include it.
      if (i === 0) {
        sawLeadingYear = true;
        continue;
      }

      cut = i;
      break;
    }
  }

  const titleTokens = tokens.slice(0, cut).filter((t) => t.length > 0);
  if (titleTokens.length === 0) return titleTokens;

  // Single-token filenames like "Movie-GROUP" never hit a noise boundary;
  // peel a trailing release-group suffix off the last token instead.
  const lastIndex = titleTokens.length - 1;
  const peeled = stripTrailingGroupSuffix(titleTokens[lastIndex]);
  if (peeled !== titleTokens[lastIndex]) {
    if (peeled.length > 0) {
      titleTokens[lastIndex] = peeled;
    } else {
      titleTokens.pop();
    }
  }

  // Drop a trailing ALL-CAPS-ish group token that survived as a standalone
  // word (e.g. "Movie GROUP" after dot-splitting). Only strip when there
  // is something else left to call a title.
  while (titleTokens.length > 1) {
    const last = titleTokens[titleTokens.length - 1];
    if (/^[A-Z]{3,}[A-Z0-9]*$/.test(last)) {
      titleTokens.pop();
      continue;
    }
    break;
  }

  return titleTokens;
}

/**
 * Heuristic title cleaner used when AI normalisation is disabled, fails,
 * or has no opinion on a particular filename. Returns a human-readable
 * title with separators and release noise removed.
 */
export function cleanTitle(rawName: string): string {
  if (!rawName) return '';

  const tokens = extractTitleTokens(rawName);
  const title = tokens.join(' ').replace(LEADING_TRAILING_JUNK, '').trim();
  if (title) return title;

  // Fallback: collapse separators on the raw input. Better than returning
  // an empty string when the heuristics over-strip an unusual filename.
  return rawName
    .replace(BRACKETED, ' ')
    .replace(PUNCT_TO_SPACE, ' ')
    .replace(WHITESPACE_RUN, ' ')
    .replace(LEADING_TRAILING_JUNK, '')
    .trim();
}

/**
 * Stable, compact key used for dedupe / cache lookups. Lower-cased,
 * alphanumeric only, with leading/trailing articles removed so
 * near-matches like "Matrix" / "The Matrix" / "Matrix, The" collapse
 * together. Ampersands are folded to "and" so "Tom & Jerry" and
 * "Tom and Jerry" agree.
 *
 * IMPORTANT: This function strips articles and is therefore unsuitable
 * for strict provider-side matching (TMDB/Jikan). Use a dedicated
 * exact-title normaliser for those callers.
 */
export function normalizeForKey(value: string): string {
  if (!value) return '';

  const folded = stripDiacritics(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(TRAILING_ARTICLES, '')
    .replace(LEADING_ARTICLES, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return folded.replace(WHITESPACE_RUN, ' ');
}

/**
 * Lightweight ASCII-fold so "Pokémon" and "Pokemon" share a dedupe key.
 */
function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
