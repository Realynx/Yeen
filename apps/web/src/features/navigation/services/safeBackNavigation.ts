import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const INITIAL_BROWSER_ROUTER_KEY = 'default';

interface SafeBackState {
  safeBackTo?: unknown;
}

function normalizeInAppPath(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return null;
  }

  return trimmed;
}

export function canNavigateBackWithinApp(locationKey: string | undefined): boolean {
  return Boolean(locationKey && locationKey !== INITIAL_BROWSER_ROUTER_KEY);
}

export function resolveSafeBackFallbackPath(pathname: string): string | null {
  const playerMatch = /^\/player\/([^/?#]+)/.exec(pathname);
  if (playerMatch) {
    return `/details/${playerMatch[1]}`;
  }

  if (pathname.startsWith('/details/')) {
    return '/library';
  }

  if (
    pathname === '/library'
    || pathname === '/explore'
    || pathname === '/settings'
    || pathname.startsWith('/admin/')
    || pathname.startsWith('/watch/')
  ) {
    return '/';
  }

  return pathname === '/' ? null : '/';
}

export function resolveSafeBackStatePath(state: unknown): string | null {
  if (!state || typeof state !== 'object') {
    return null;
  }

  return normalizeInAppPath((state as SafeBackState).safeBackTo);
}

export function useSafeBackNavigation(defaultFallbackPath?: string) {
  const location = useLocation();
  const navigate = useNavigate();

  return useCallback((overrideFallbackPath?: string) => {
    if (canNavigateBackWithinApp(location.key)) {
      navigate(-1);
      return;
    }

    const fallbackPath =
      normalizeInAppPath(overrideFallbackPath)
      ?? resolveSafeBackStatePath(location.state)
      ?? normalizeInAppPath(defaultFallbackPath)
      ?? resolveSafeBackFallbackPath(location.pathname);

    if (!fallbackPath) {
      return;
    }

    navigate(fallbackPath, { replace: true });
  }, [
    defaultFallbackPath,
    location.key,
    location.pathname,
    location.state,
    navigate,
  ]);
}
