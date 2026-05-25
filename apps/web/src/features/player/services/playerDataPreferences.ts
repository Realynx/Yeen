import type {
  PlaybackAudioTrack,
  ProgressEntry,
  SubtitleTrack,
} from '../../shared/services/types';
import type { SeriesPlaybackPreference } from './playerData.types';

function normalizeLanguageCode(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function findTrackByPreferredLanguage<T extends { language: string | null }>(
  tracks: readonly T[],
  preferredLanguage: string | null | undefined,
): T | null {
  const normalizedPreferredLanguage = normalizeLanguageCode(preferredLanguage);
  if (!normalizedPreferredLanguage) {
    return null;
  }

  const exactMatch = tracks.find((track) => {
    return normalizeLanguageCode(track.language) === normalizedPreferredLanguage;
  });
  if (exactMatch) {
    return exactMatch;
  }

  const preferredBaseLanguage = normalizedPreferredLanguage.split(/[-_]/)[0];
  if (!preferredBaseLanguage) {
    return null;
  }

  return (
    tracks.find((track) => {
      const candidateBaseLanguage = normalizeLanguageCode(track.language).split(/[-_]/)[0];
      return candidateBaseLanguage === preferredBaseLanguage;
    }) ?? null
  );
}

export function pickPreferredAudioStreamIndex(
  tracks: readonly PlaybackAudioTrack[],
  preferredLanguage: string | null | undefined,
): number | null {
  const preferredTrack = findTrackByPreferredLanguage(tracks, preferredLanguage);
  return preferredTrack?.streamIndex ?? null;
}

export function pickPreferredSubtitleTrack(
  tracks: readonly SubtitleTrack[],
  preferredLanguage: string | null | undefined,
  options?: {
    requireUrl?: boolean;
  },
): SubtitleTrack | null {
  const requireUrl = options?.requireUrl ?? false;
  const candidates = requireUrl
    ? tracks.filter((track) => Boolean(track.url))
    : tracks;

  return findTrackByPreferredLanguage(candidates, preferredLanguage);
}

export function pickPreferredSubtitleTrackId(
  tracks: readonly SubtitleTrack[],
  preferredLanguage: string | null | undefined,
): string {
  const preferredTrack = pickPreferredSubtitleTrack(tracks, preferredLanguage, {
    requireUrl: true,
  });
  return preferredTrack?.id ?? '';
}

export function pickPreferredSubtitleTrackToExtract(
  tracks: readonly SubtitleTrack[],
  preferredLanguage: string | null | undefined,
): SubtitleTrack | null {
  const extractedPreferredTrack = pickPreferredSubtitleTrack(
    tracks,
    preferredLanguage,
    {
      requireUrl: true,
    },
  );
  if (extractedPreferredTrack) {
    return null;
  }

  const extractableCandidates = tracks.filter((track) => {
    return (
      !track.url
      && track.extractable
      && typeof track.streamIndex === 'number'
    );
  });

  return pickPreferredSubtitleTrack(extractableCandidates, preferredLanguage, {
    requireUrl: false,
  });
}

export function toSeriesPlaybackPreference(
  entries: readonly ProgressEntry[],
  seriesPreferenceKey: string | null,
): SeriesPlaybackPreference | null {
  const normalizedSeriesPreferenceKey = seriesPreferenceKey?.trim() ?? '';
  if (!normalizedSeriesPreferenceKey) {
    return null;
  }

  for (const entry of entries) {
    if (entry.seriesPreferenceKey !== normalizedSeriesPreferenceKey) {
      continue;
    }

    const hasExplicitPreference =
      entry.preferredAudioLanguage !== undefined
      || entry.preferredSubtitleLanguage !== undefined
      || entry.subtitlePreferenceEnabled !== undefined;
    if (!hasExplicitPreference) {
      continue;
    }

    return {
      key: normalizedSeriesPreferenceKey,
      preferredAudioLanguage: entry.preferredAudioLanguage ?? null,
      preferredSubtitleLanguage: entry.preferredSubtitleLanguage ?? null,
      subtitlePreferenceEnabled: entry.subtitlePreferenceEnabled ?? null,
    };
  }

  return null;
}
