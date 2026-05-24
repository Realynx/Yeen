import {
  VolumeHighIcon,
  VolumeLowIcon,
  VolumeMuteIcon,
} from '../PlayerIcons';

export function VolumeIcon({
  muted,
  volume,
}: {
  muted: boolean;
  volume: number;
}) {
  if (muted || volume <= 0.01) {
    return <VolumeMuteIcon />;
  }

  if (volume < 0.5) {
    return <VolumeLowIcon />;
  }

  return <VolumeHighIcon />;
}

export function formatStatSeconds(value: number): string {
  if (!Number.isFinite(value)) {
    return '0.00s';
  }

  return `${value.toFixed(2)}s`;
}

export function formatStatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return '0%';
  }

  return `${value.toFixed(1)}%`;
}

export function formatBandwidthUsage(bitsPerSecond: number | null): string {
  if (!Number.isFinite(bitsPerSecond) || bitsPerSecond === null || bitsPerSecond <= 0) {
    return 'sampling...';
  }

  const units = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  let value = bitsPerSecond;
  let unitIndex = 0;

  while (value >= 1000 && unitIndex < units.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }

  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function describeReadyState(value: number): string {
  switch (value) {
    case HTMLMediaElement.HAVE_NOTHING:
      return 'HAVE_NOTHING';
    case HTMLMediaElement.HAVE_METADATA:
      return 'HAVE_METADATA';
    case HTMLMediaElement.HAVE_CURRENT_DATA:
      return 'HAVE_CURRENT_DATA';
    case HTMLMediaElement.HAVE_FUTURE_DATA:
      return 'HAVE_FUTURE_DATA';
    case HTMLMediaElement.HAVE_ENOUGH_DATA:
      return 'HAVE_ENOUGH_DATA';
    default:
      return `UNKNOWN (${value})`;
  }
}

export function describeNetworkState(value: number): string {
  switch (value) {
    case HTMLMediaElement.NETWORK_EMPTY:
      return 'NETWORK_EMPTY';
    case HTMLMediaElement.NETWORK_IDLE:
      return 'NETWORK_IDLE';
    case HTMLMediaElement.NETWORK_LOADING:
      return 'NETWORK_LOADING';
    case HTMLMediaElement.NETWORK_NO_SOURCE:
      return 'NETWORK_NO_SOURCE';
    default:
      return `UNKNOWN (${value})`;
  }
}

export function toStatsTimestamp(value: string | null): string {
  if (!value) {
    return 'Not yet polled';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString();
}
