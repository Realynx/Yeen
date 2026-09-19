import type { RuntimeRestartMode } from './types-addons';

export type CoreUpdatePhase =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'staged'
  | 'draining'
  | 'applying'
  | 'succeeded'
  | 'failed';

export interface CoreUpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  repository: string | null;
  channel: 'stable' | 'prerelease';
  configured: boolean;
  managedMode: 'systemd' | 'docker' | 'unsupported';
  operatorCommand: string | null;
  updateAvailable: boolean;
  phase: CoreUpdatePhase;
  mode: RuntimeRestartMode | null;
  activePlaybackCount: number;
  checkedAt: string | null;
  publishedAt: string | null;
  message: string | null;
}
