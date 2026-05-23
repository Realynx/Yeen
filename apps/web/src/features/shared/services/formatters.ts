type FormatPrecision = 'adaptive' | 'one-for-scaled';

interface FormatScaleOptions {
  units: readonly string[];
  zeroLabel: string;
  precision: FormatPrecision;
}

function formatScaledValue(
  input: number,
  { units, zeroLabel, precision }: FormatScaleOptions,
): string {
  if (!Number.isFinite(input) || input <= 0) {
    return zeroLabel;
  }

  let value = input;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const fractionDigits =
    precision === 'adaptive'
      ? value >= 10 || unitIndex === 0
        ? 0
        : 1
      : unitIndex === 0
        ? 0
        : 1;

  return `${value.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

interface FormatBytesOptions {
  units?: readonly string[];
  zeroLabel?: string;
  precision?: FormatPrecision;
}

export function formatBytes(
  bytes: number,
  options: FormatBytesOptions = {},
): string {
  return formatScaledValue(bytes, {
    units: options.units ?? ['B', 'KB', 'MB', 'GB', 'TB'],
    zeroLabel: options.zeroLabel ?? '0 B',
    precision: options.precision ?? 'adaptive',
  });
}

interface FormatRateOptions {
  units?: readonly string[];
  zeroLabel?: string;
  precision?: FormatPrecision;
}

export function formatRate(
  bytesPerSecond: number,
  options: FormatRateOptions = {},
): string {
  return formatScaledValue(bytesPerSecond, {
    units: options.units ?? ['B/s', 'KB/s', 'MB/s', 'GB/s'],
    zeroLabel: options.zeroLabel ?? '0 B/s',
    precision: options.precision ?? 'one-for-scaled',
  });
}

export function formatPercent(progress: number): string {
  return `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
}

export function formatEtaShort(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= 8_640_000) {
    return '--';
  }

  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  return `${hours}h ${minutes}m`;
}
