import { BadRequestException } from '@nestjs/common';
import type { PlaybackAudioTrack } from '../../../media/application/services/media.service';

/**
 * Normalizes an audio stream index value, accepting null/undefined and rejecting
 * negative/non-integer values.
 */
export function normalizeAudioStreamIndexValue(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isInteger(value) || value < 0) {
    return null;
  }

  return value;
}

/**
 * Resolves the requested audio stream index against available tracks.
 * Falls back to the default track if no request is made, throws if the
 * requested track is unavailable.
 */
export function resolveRequestedAudioStreamIndexValue(
  requestedAudioStreamIndex: number | null,
  audioTracks: PlaybackAudioTrack[],
): number | null {
  if (audioTracks.length === 0) {
    return null;
  }

  if (requestedAudioStreamIndex === null) {
    return (
      audioTracks.find((track) => track.isDefault)?.streamIndex ??
      audioTracks[0].streamIndex
    );
  }

  if (
    audioTracks.some(
      (track) => track.streamIndex === requestedAudioStreamIndex,
    )
  ) {
    return requestedAudioStreamIndex;
  }

  throw new BadRequestException(
    'Selected audio track is not available for this media item.',
  );
}
