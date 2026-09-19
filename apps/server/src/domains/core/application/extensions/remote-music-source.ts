import { Injectable } from '@nestjs/common';
import type { RemoteMusicResult } from '@yeen/shared-contracts';

export const REMOTE_MUSIC_SOURCES = Symbol.for(
  'com.yeen.addons.remote-music-sources.v1',
);

export interface RemoteMusicSourceSearchRequest {
  query: string;
  limit: number;
}

export interface RemoteMusicSourceDiscoverRequest {
  country: string;
  limit: number;
}

export interface RemoteMusicSourceAdapter {
  readonly adapterId: string;
  readonly provider: string;
  search(request: RemoteMusicSourceSearchRequest): Promise<RemoteMusicResult[]>;
  discover?(
    request: RemoteMusicSourceDiscoverRequest,
  ): Promise<RemoteMusicResult[]>;
}

@Injectable()
export class RemoteMusicSourceRegistry {
  private readonly adapters = new Map<string, RemoteMusicSourceAdapter>();

  register(adapter: RemoteMusicSourceAdapter): () => void {
    if (this.adapters.has(adapter.adapterId)) {
      throw new Error(
        `Remote music source adapter already registered: ${adapter.adapterId}`,
      );
    }

    this.adapters.set(adapter.adapterId, adapter);
    return () => {
      if (this.adapters.get(adapter.adapterId) === adapter) {
        this.adapters.delete(adapter.adapterId);
      }
    };
  }

  list(): readonly RemoteMusicSourceAdapter[] {
    return [...this.adapters.values()];
  }
}
