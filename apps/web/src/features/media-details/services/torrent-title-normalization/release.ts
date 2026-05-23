import {
  EPISODE_ONLY_PATTERN,
  EPISODE_PATTERNS,
  MOVIE_PATTERN,
  RANGE_PATTERN,
  RELEASE_PACK_PATTERN,
  SPECIAL_PATTERN,
} from './patterns';
import {
  normalizeWhitespace,
  padEpisode,
  parsePositiveInt,
} from './helpers';
import type { TorrentReleaseMarker } from './types';

export function detectReleaseMarker(rawTitle: string): TorrentReleaseMarker {
  const normalizedTitle = normalizeWhitespace(rawTitle);

  for (const pattern of EPISODE_PATTERNS) {
    const match = normalizedTitle.match(pattern);
    if (!match) {
      continue;
    }

    const season = parsePositiveInt(match[1]);
    const episodeStart = parsePositiveInt(match[2]);
    const episodeEnd = parsePositiveInt(match[3]);

    if (!season || !episodeStart) {
      continue;
    }

    if (episodeEnd && episodeEnd >= episodeStart) {
      return {
        kind: 'range',
        season,
        episode: episodeStart,
        episodeEnd,
        label: `S${String(season).padStart(2, '0')}E${padEpisode(episodeStart)}-E${padEpisode(episodeEnd)}`,
      };
    }

    return {
      kind: 'episode',
      season,
      episode: episodeStart,
      episodeEnd: null,
      label: `S${String(season).padStart(2, '0')}E${padEpisode(episodeStart)}`,
    };
  }

  const explicitEpisodeMatch = normalizedTitle.match(EPISODE_ONLY_PATTERN);
  if (explicitEpisodeMatch) {
    const episode = parsePositiveInt(explicitEpisodeMatch[1]);
    if (episode) {
      const seasonMatch = normalizedTitle.match(/\bS(?:EASON)?\s*0?(\d{1,2})\b/i);
      const season = parsePositiveInt(seasonMatch?.[1]);
      return {
        kind: 'episode',
        season,
        episode,
        episodeEnd: null,
        label: season
          ? `S${String(season).padStart(2, '0')}E${padEpisode(episode)}`
          : `Episode ${padEpisode(episode)}`,
      };
    }
  }

  const rangeMatch = normalizedTitle.match(RANGE_PATTERN);
  if (rangeMatch) {
    const start = parsePositiveInt(rangeMatch[1]);
    const end = parsePositiveInt(rangeMatch[2]);
    const looksLikeYearRange =
      typeof start === 'number'
      && typeof end === 'number'
      && start >= 1900
      && end >= 1900;
    const seasonMatch = normalizedTitle.match(/\bS(?:EASON)?\s*0?(\d{1,2})\b/i);
    const season = parsePositiveInt(seasonMatch?.[1]);

    if (
      !looksLikeYearRange
      && start
      && end
      && end >= start
      && start <= 200
      && end <= 200
    ) {
      const isPack = RELEASE_PACK_PATTERN.test(normalizedTitle);
      const label = season
        ? `S${String(season).padStart(2, '0')}E${padEpisode(start)}-E${padEpisode(end)}`
        : `E${padEpisode(start)}-E${padEpisode(end)}`;

      return {
        kind: isPack ? 'pack' : 'range',
        season,
        episode: start,
        episodeEnd: end,
        label,
      };
    }
  }

  const seasonOnlyMatch = normalizedTitle.match(/\bS(?:EASON)?\s*0?(\d{1,2})\b/i);
  const detectedSeason = parsePositiveInt(seasonOnlyMatch?.[1]);
  const hasPack = RELEASE_PACK_PATTERN.test(normalizedTitle);
  if (hasPack) {
    return {
      kind: 'pack',
      season: detectedSeason,
      episode: null,
      episodeEnd: null,
      label: detectedSeason ? `Season ${detectedSeason} Pack` : 'Pack',
    };
  }

  if (MOVIE_PATTERN.test(normalizedTitle)) {
    return {
      kind: 'movie',
      season: detectedSeason,
      episode: null,
      episodeEnd: null,
      label: 'Movie',
    };
  }

  if (SPECIAL_PATTERN.test(normalizedTitle)) {
    return {
      kind: 'special',
      season: detectedSeason,
      episode: null,
      episodeEnd: null,
      label: detectedSeason ? `Season ${detectedSeason} Special` : 'Special',
    };
  }

  return {
    kind: 'unknown',
    season: detectedSeason,
    episode: null,
    episodeEnd: null,
    label: null,
  };
}
