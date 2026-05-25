import type { ResolvedTranscodeProfile } from './hls-session-lifecycle.helper';

interface ResolveTranscodeProfileInput {
  accountMaxBitrateKbps: number | null;
  systemDefaultVideoBitrateKbps: number;
  systemDefaultAudioBitrateKbps: number;
  systemDefaultMaxOutputHeight: number;
  requestedMaxVideoBitrateKbps?: number | null;
  requestedAudioBitrateKbps?: number | null;
  requestedMaxOutputHeight?: number | null;
}

export function resolveTranscodeProfileValue(
  input: ResolveTranscodeProfileInput,
): ResolvedTranscodeProfile {
  const videoBitrateCeilingKbps = clampIntegerValue(
    input.accountMaxBitrateKbps ?? input.systemDefaultVideoBitrateKbps,
    250,
    50000,
  );

  const maxVideoBitrateKbps = clampIntegerValue(
    input.requestedMaxVideoBitrateKbps ?? videoBitrateCeilingKbps,
    250,
    videoBitrateCeilingKbps,
  );

  const audioBitrateKbps = clampIntegerValue(
    input.requestedAudioBitrateKbps ?? input.systemDefaultAudioBitrateKbps,
    48,
    384,
  );

  const maxOutputHeightCeiling = clampIntegerValue(
    input.systemDefaultMaxOutputHeight,
    240,
    2160,
  );

  const maxOutputHeight = clampIntegerValue(
    input.requestedMaxOutputHeight ?? maxOutputHeightCeiling,
    240,
    maxOutputHeightCeiling,
  );

  return {
    maxVideoBitrateKbps,
    audioBitrateKbps,
    maxOutputHeight,
  };
}

function clampIntegerValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}
