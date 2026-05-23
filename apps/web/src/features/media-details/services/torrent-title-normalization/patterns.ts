export const RESOLUTION_PATTERN =
  /\b(?:4320p|2160p|1440p|1080p|900p|720p|576p|540p|480p|360p|4k|8k)\b/gi;

export const SOURCE_PATTERN =
  /\b(?:bdrip|bluray|blu-ray|bdmv|web[ .-]?(?:dl|rip)?|hdtv|dvd(?:rip)?|remux|tvrip)\b/gi;

export const VIDEO_PATTERN =
  /\b(?:hevc|av1|avc|x264|x265|h\.?264|h\.?265|vp9|hi10|10bit|8bit)\b/gi;

export const AUDIO_PATTERN =
  /\b(?:dual[ -]?audio|multi[ -]?subs?|flac|aac\s*\d(?:\.\d)?|aac|opus|ddp?(?:\s*[\d.]+)?|dts(?:-hd(?:\s*ma)?)?|truehd|eac3|ac3)\b/gi;

export const LANGUAGE_PATTERN =
  /\b(?:vostfr|eng(?:lish)?(?:\s*dub)?|dub(?:bed)?|sub(?:bed)?|jpn|jp|rus|ita|esp|ger|chs|cht|mandarin)\b/gi;

export const FORMAT_PATTERN = /\b(?:mkv|mp4|avi|bdmv)\b/gi;

export const RELEASE_PATTERN =
  /\b(?:repack|proper|uncensored|batch|complete|specials?|ova|ona|movie|theat(?:er|re)(?:\s*manners?)?|remaster|season\s*\d+)\b/gi;

export const RELEASE_PACK_PATTERN =
  /\b(?:batch|complete|全集|collection|set|season\s*\d+\s*\+|s\d+\s*\+|vol(?:ume)?\.?\s*\d+\s*-\s*\d+)\b/i;

export const MOVIE_PATTERN = /\b(?:movie|the\s+movie|film|gekijouban)\b/i;
export const SPECIAL_PATTERN = /\b(?:ova|ona|special|sp(?:ecial)?)\b/i;

export const EPISODE_PATTERNS: RegExp[] = [
  /\bS(\d{1,2})\s*E(\d{1,3})(?:\s*[-~]\s*E?(\d{1,3}))?\b/i,
  /\b(\d{1,2})x(\d{1,3})(?:\s*[-~]\s*(\d{1,3}))?\b/i,
];

export const EPISODE_ONLY_PATTERN = /\bE(?:P)?\.?\s*(\d{1,3})\b/i;

export const RANGE_PATTERN =
  /(?:^|[\s[(])(\d{1,3})\s*[-~]\s*(\d{1,3})(?=$|[\s)\]])/i;

export const BRACKETED_SEGMENT_PATTERN =
  /(?:\[|\(|\{)([^)\]}]{2,80})(?:\]|\)|\})/g;
