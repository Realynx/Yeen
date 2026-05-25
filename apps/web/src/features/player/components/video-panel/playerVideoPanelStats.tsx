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
