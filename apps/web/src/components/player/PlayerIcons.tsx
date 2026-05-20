import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon({ children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function PlayIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M7 5.5v13a.5.5 0 0 0 .77.42l10.5-6.5a.5.5 0 0 0 0-.84L7.77 5.08A.5.5 0 0 0 7 5.5Z" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function SkipBackIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <polyline points="3 4 3 9 8 9" />
      <text x="12" y="15" fontSize="7" fontFamily="inherit" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">10</text>
    </BaseIcon>
  );
}

export function SkipForwardIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <polyline points="21 4 21 9 16 9" />
      <text x="12" y="15" fontSize="7" fontFamily="inherit" fontWeight="700" textAnchor="middle" fill="currentColor" stroke="none">10</text>
    </BaseIcon>
  );
}

export function VolumeHighIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" stroke="currentColor" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 6a8 8 0 0 1 0 12" />
    </BaseIcon>
  );
}

export function VolumeLowIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" stroke="currentColor" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" />
    </BaseIcon>
  );
}

export function VolumeMuteIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" stroke="currentColor" />
      <line x1="16" y1="9" x2="22" y2="15" />
      <line x1="22" y1="9" x2="16" y2="15" />
    </BaseIcon>
  );
}

export function CaptionsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="2.5" y="5" width="19" height="14" rx="3" />
      <path d="M9.5 10.5a2 2 0 1 0 0 3" />
      <path d="M16.5 10.5a2 2 0 1 0 0 3" />
    </BaseIcon>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="2.6" />
      <path d="M19.4 13.6a7.7 7.7 0 0 0 .06-3.2l1.74-1.3-1.8-3.1-2.04.78a7.7 7.7 0 0 0-2.78-1.6L14.2 3h-3.6l-.38 2.18a7.7 7.7 0 0 0-2.78 1.6l-2.04-.78-1.8 3.1L5.34 10.4a7.7 7.7 0 0 0 .06 3.2L3.66 14.9l1.8 3.1 2.04-.78a7.7 7.7 0 0 0 2.78 1.6L10.6 21h3.6l.38-2.18a7.7 7.7 0 0 0 2.78-1.6l2.04.78 1.8-3.1Z" />
    </BaseIcon>
  );
}

export function PipIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <rect x="12" y="11" width="8" height="6" rx="1.2" fill="currentColor" stroke="currentColor" />
    </BaseIcon>
  );
}

export function TheaterIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <line x1="2.5" y1="9.5" x2="21.5" y2="9.5" />
      <line x1="2.5" y1="14.5" x2="21.5" y2="14.5" />
    </BaseIcon>
  );
}

export function FullscreenEnterIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polyline points="4 9 4 4 9 4" />
      <polyline points="20 9 20 4 15 4" />
      <polyline points="4 15 4 20 9 20" />
      <polyline points="20 15 20 20 15 20" />
    </BaseIcon>
  );
}

export function FullscreenExitIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polyline points="9 4 9 9 4 9" />
      <polyline points="15 4 15 9 20 9" />
      <polyline points="9 20 9 15 4 15" />
      <polyline points="15 20 15 15 20 15" />
    </BaseIcon>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polyline points="20 6 9 17 4 12" />
    </BaseIcon>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <polyline points="9 6 15 12 9 18" />
    </BaseIcon>
  );
}
