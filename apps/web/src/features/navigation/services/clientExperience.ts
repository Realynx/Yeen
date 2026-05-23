import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';

export type ClientExperience = 'desktop' | 'phone' | 'tv';

export interface PageVariants<TProps> {
  desktop: ComponentType<TProps>;
  phone?: ComponentType<TProps>;
  tv?: ComponentType<TProps>;
}

const QUERY_PARAM_NAME = 'ui';
const STORAGE_KEY = 'yeen:ui-experience';

function normalizeExperience(value: string | null | undefined): ClientExperience | null {
  const normalized = value?.trim().toLowerCase() ?? '';

  if (normalized === 'desktop' || normalized === 'phone' || normalized === 'tv') {
    return normalized;
  }

  return null;
}

function readExperienceOverride(target: Window): ClientExperience | null {
  const queryValue = new URLSearchParams(target.location.search).get(QUERY_PARAM_NAME);
  const queryOverride = normalizeExperience(queryValue);
  if (queryOverride) {
    return queryOverride;
  }

  try {
    return normalizeExperience(target.localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function detectClientExperience(target: Window): ClientExperience {
  const override = readExperienceOverride(target);
  if (override) {
    return override;
  }

  const width = target.innerWidth;
  const height = target.innerHeight;
  const shortestSide = Math.min(width, height);
  const coarsePointer = target.matchMedia('(pointer: coarse)').matches;
  const hoverNone = target.matchMedia('(hover: none)').matches;
  const touchPrimaryInput = coarsePointer || hoverNone;

  if (shortestSide <= 820 || (touchPrimaryInput && width <= 1024)) {
    return 'phone';
  }

  if (!touchPrimaryInput && width >= 1600 && height >= 900) {
    return 'tv';
  }

  return 'desktop';
}

function addMediaListener(query: MediaQueryList, onChange: () => void) {
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }

  query.addListener(onChange);
  return () => {
    query.removeListener(onChange);
  };
}

export function useClientExperience(): ClientExperience {
  const [experience, setExperience] = useState<ClientExperience>(() => {
    if (typeof window === 'undefined') {
      return 'desktop';
    }

    return detectClientExperience(window);
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const refresh = () => {
      setExperience(detectClientExperience(window));
    };

    const coarsePointerQuery = window.matchMedia('(pointer: coarse)');
    const hoverNoneQuery = window.matchMedia('(hover: none)');

    refresh();
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    window.addEventListener('popstate', refresh);

    const removeCoarsePointerListener = addMediaListener(coarsePointerQuery, refresh);
    const removeHoverNoneListener = addMediaListener(hoverNoneQuery, refresh);

    return () => {
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
      window.removeEventListener('popstate', refresh);
      removeCoarsePointerListener();
      removeHoverNoneListener();
    };
  }, []);

  return experience;
}

export function selectPageVariant<TProps>(
  experience: ClientExperience,
  variants: PageVariants<TProps>,
): ComponentType<TProps> {
  if (experience === 'phone') {
    return variants.phone ?? variants.desktop;
  }

  if (experience === 'tv') {
    return variants.tv ?? variants.desktop;
  }

  return variants.desktop;
}
