import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RemoteMusicDiscoverResponse,
  RemoteMusicSearchResponse,
} from '@yeen/shared-contracts';
import {
  discoverRemoteMusic,
  searchRemoteMusic,
  toApiErrorMessage,
} from '../../shared/services/api';

export function useRemoteMusicCatalog(token: string) {
  const [searchResponse, setSearchResponse] = useState<RemoteMusicSearchResponse | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [discoverResponse, setDiscoverResponse] = useState<RemoteMusicDiscoverResponse | null>(null);
  const [discoverLoading, setDiscoverLoading] = useState(true);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const discoverController = useRef<AbortController | null>(null);

  const discover = useCallback(async () => {
    discoverController.current?.abort();
    const controller = new AbortController();
    discoverController.current = controller;
    setDiscoverLoading(true);
    setDiscoverError(null);
    try {
      const response = await discoverRemoteMusic(token, {
        limit: 12,
        signal: controller.signal,
      });
      setDiscoverResponse(response);
    } catch (error) {
      if (!controller.signal.aborted) {
        setDiscoverError(toApiErrorMessage(error, 'Discover is unavailable right now.'));
      }
    } finally {
      if (!controller.signal.aborted) {
        setDiscoverLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    discoverController.current = controller;
    void discoverRemoteMusic(token, {
      limit: 12,
      signal: controller.signal,
    }).then((response) => {
      if (!controller.signal.aborted) {
        setDiscoverResponse(response);
        setDiscoverLoading(false);
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setDiscoverError(toApiErrorMessage(error, 'Discover is unavailable right now.'));
        setDiscoverLoading(false);
      }
    });
    return () => {
      searchController.current?.abort();
      controller.abort();
    };
  }, [token]);

  const search = useCallback(async (query: string) => {
    const normalized = query.trim();
    setSearchQuery(normalized);
    setSearchResponse(null);
    setSearchError(null);
    searchController.current?.abort();
    if (!normalized) {
      setSearchLoading(false);
      return;
    }

    const controller = new AbortController();
    searchController.current = controller;
    setSearchLoading(true);
    try {
      const response = await searchRemoteMusic(token, normalized, {
        limit: 24,
        signal: controller.signal,
      });
      setSearchResponse(response);
    } catch (error) {
      if (!controller.signal.aborted) {
        setSearchError(toApiErrorMessage(error, 'Unable to search music providers.'));
      }
    } finally {
      if (!controller.signal.aborted) {
        setSearchLoading(false);
      }
    }
  }, [token]);

  const clearSearch = useCallback(() => {
    searchController.current?.abort();
    setSearchQuery('');
    setSearchResponse(null);
    setSearchError(null);
    setSearchLoading(false);
  }, []);

  return {
    search,
    clearSearch,
    searchQuery,
    searchResponse,
    searchLoading,
    searchError,
    discover: () => void discover(),
    discoverResponse,
    discoverLoading,
    discoverError,
  };
}
