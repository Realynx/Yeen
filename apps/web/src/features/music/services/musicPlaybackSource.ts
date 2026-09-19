import {
  getPlaybackPlan,
  startHlsSession,
  withAccessToken,
} from '../../shared/services/api';
import type { HlsStartResponse, PlaybackPlan } from '../../shared/services/types';

export interface MusicPlaybackSource {
  kind: 'direct' | 'hls';
  url: string;
}

interface MusicPlaybackSourceDependencies {
  getPlan: (token: string, mediaId: string) => Promise<PlaybackPlan>;
  startHls: (token: string, mediaId: string) => Promise<HlsStartResponse>;
  authenticateUrl: (url: string, token: string) => string;
}

type MusicHlsFallbackDependencies = Pick<
  MusicPlaybackSourceDependencies,
  'startHls' | 'authenticateUrl'
>;

const defaultDependencies: MusicPlaybackSourceDependencies = {
  getPlan: getPlaybackPlan,
  startHls: (token, mediaId) => startHlsSession(token, mediaId),
  authenticateUrl: withAccessToken,
};

export async function resolveMusicPlaybackSource(
  token: string,
  mediaId: string,
  dependencies: MusicPlaybackSourceDependencies = defaultDependencies,
): Promise<MusicPlaybackSource> {
  const plan = await dependencies.getPlan(token, mediaId);

  if (plan.directPlay.supported && plan.directPlay.url) {
    return {
      kind: 'direct',
      url: dependencies.authenticateUrl(plan.directPlay.url, token),
    };
  }

  return resolveMusicHlsFallbackSource(token, mediaId, dependencies);
}

export async function resolveMusicHlsFallbackSource(
  token: string,
  mediaId: string,
  dependencies: MusicHlsFallbackDependencies = defaultDependencies,
): Promise<MusicPlaybackSource> {
  const hlsSession = await dependencies.startHls(token, mediaId);
  return {
    kind: 'hls',
    url: dependencies.authenticateUrl(hlsSession.manifestUrl, token),
  };
}
