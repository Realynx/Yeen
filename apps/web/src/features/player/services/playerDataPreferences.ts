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

export function pickPreferredSubtitleTrackId(
  tracks: readonly SubtitleTrack[],
  preferredLanguage: string | null | undefined,
): string {
  const availableTracks = tracks.filter((track) => Boolean(track.url));
  const preferredTrack = findTrackByPreferredLanguage(availableTracks, preferredLanguage);
  return preferredTrack?.id ?? '';
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
