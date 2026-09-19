import type { FfprobePayload } from '../../../infrastructure/media-probe.adapter';

export function resolveDurationSeconds(
  payload: FfprobePayload,
  fileSizeBytes: number,
): number {
  const directDuration = parseNumber(payload.format?.duration);
  if (isPositive(directDuration)) return directDuration;

  const formatTagDuration = parseDurationFromTagCollection(
    payload.format?.tags,
  );
  if (isPositive(formatTagDuration)) return formatTagDuration;

  const streamDuration = findStreamTagDuration(payload.streams ?? []);
  if (streamDuration !== null) return streamDuration;

  return estimateDurationFromBitrate(payload.format?.bit_rate, fileSizeBytes);
}

function isPositive(value: number | null): value is number {
  return value !== null && value > 0;
}

function findStreamTagDuration(
  streams: NonNullable<FfprobePayload['streams']>,
): number | null {
  for (const stream of streams) {
    const duration = parseDurationFromTagCollection(stream.tags);
    if (isPositive(duration)) return duration;
  }
  return null;
}

function estimateDurationFromBitrate(
  bitRateText: string | undefined,
  fileSizeBytes: number,
): number {
  const bitRate = parseNumber(bitRateText);
  if (
    !isPositive(bitRate) ||
    !Number.isFinite(fileSizeBytes) ||
    fileSizeBytes <= 0
  ) {
    return 0;
  }
  const estimatedSeconds = (fileSizeBytes * 8) / bitRate;
  return Number.isFinite(estimatedSeconds) &&
    estimatedSeconds > 30 &&
    estimatedSeconds < 12 * 60 * 60
    ? estimatedSeconds
    : 0;
}

export function parseFrameRate(value?: string): number | null {
  if (!value) {
    return null;
  }

  if (value.includes('/')) {
    const [numeratorRaw, denominatorRaw] = value.split('/');
    const numerator = Number.parseFloat(numeratorRaw);
    const denominator = Number.parseFloat(denominatorRaw);

    if (
      !Number.isFinite(numerator) ||
      !Number.isFinite(denominator) ||
      denominator === 0
    ) {
      return null;
    }

    return Math.round((numerator / denominator) * 1000) / 1000;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1000) / 1000 : null;
}

export function parseNumber(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDurationFromTagCollection(
  tags: Record<string, string | undefined> | undefined,
): number | null {
  if (!tags) {
    return null;
  }

  for (const [key, value] of Object.entries(tags)) {
    if (!value || !key.toLowerCase().startsWith('duration')) {
      continue;
    }

    const parsed = parseDurationString(value);
    if (parsed && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function parseDurationString(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || /^n\/a$/i.test(trimmed)) {
    return null;
  }

  const numeric = parseNumber(trimmed);
  if (numeric && numeric > 0) {
    return numeric;
  }

  const hhmmssMatch = trimmed.match(/^(\d+):(\d{1,2}):(\d{1,2})(?:\.(\d+))?$/);
  if (hhmmssMatch) {
    const hours = Number.parseInt(hhmmssMatch[1], 10);
    const minutes = Number.parseInt(hhmmssMatch[2], 10);
    const seconds = Number.parseInt(hhmmssMatch[3], 10);
    const fraction = hhmmssMatch[4]
      ? Number.parseFloat(`0.${hhmmssMatch[4]}`)
      : 0;

    if (
      Number.isFinite(hours) &&
      Number.isFinite(minutes) &&
      Number.isFinite(seconds)
    ) {
      return (
        hours * 3600 +
        minutes * 60 +
        seconds +
        (Number.isFinite(fraction) ? fraction : 0)
      );
    }
  }

  return null;
}
