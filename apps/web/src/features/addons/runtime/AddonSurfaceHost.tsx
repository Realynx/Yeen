import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAddonHost } from './AddonHostContext';
import { resolveAddonElementTag } from './addonRuntimeRegistry';
import type {
  AddonNavigateEventDetail,
  AddonExperienceElementTags,
  AddonMediaCardStateEventDetail,
  AddonSurfaceElementContext,
  YeenAddonIdentity,
} from './addonRuntime.types';

interface AddonSurfaceHostProps {
  addon: YeenAddonIdentity;
  elementTag: string;
  experienceElementTags?: AddonExperienceElementTags;
  surface: string;
  className?: string;
  mediaItem?: unknown;
  remoteMusicResult?: unknown;
  preparation?: unknown;
  route?: {
    path: string;
    title: string;
  };
  onMediaCardState?: (state: AddonMediaCardStateEventDetail) => void;
}

interface AddonSurfaceElement extends HTMLElement {
  yeenContext?: AddonSurfaceElementContext;
}

export function AddonSurfaceHost({
  addon,
  elementTag,
  experienceElementTags,
  surface,
  className,
  mediaItem,
  remoteMusicResult,
  preparation,
  route,
  onMediaCardState,
}: AddonSurfaceHostProps) {
  const { accessToken, user, clientExperience } = useAddonHost();
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let element: AddonSurfaceElement;
    try {
      const resolvedElementTag = resolveAddonElementTag(
        elementTag,
        experienceElementTags,
        clientExperience,
      );
      element = document.createElement(resolvedElementTag) as AddonSurfaceElement;
      element.yeenContext = {
        accessToken,
        user,
        addonId: addon.id,
        surface,
        clientExperience,
        mediaItem,
        remoteMusicResult,
        preparation,
        route,
      };
      container.replaceChildren(element);
      setError(null);
    } catch {
      setError(`Unable to render the ${addon.name} surface.`);
      return;
    }

    function handleNavigate(event: Event) {
      const detail = (event as CustomEvent<AddonNavigateEventDetail>).detail;
      if (!detail || typeof detail.to !== 'string' || !detail.to.startsWith('/')) {
        return;
      }

      navigate(detail.to, { replace: detail.replace === true });
    }

    function handleMediaCardState(event: Event) {
      const detail = (event as CustomEvent<AddonMediaCardStateEventDetail>).detail;
      if (!detail || !onMediaCardState) {
        return;
      }
      const progressPercent = detail.progressPercent === null
        ? null
        : typeof detail.progressPercent === 'number'
          && Number.isFinite(detail.progressPercent)
          ? Math.max(0, Math.min(100, detail.progressPercent))
          : undefined;
      onMediaCardState({
        progressPercent,
        tone: detail.tone === 'accent' ? 'accent' : 'default',
        label: typeof detail.label === 'string' ? detail.label.trim() || null : null,
      });
    }

    element.addEventListener('yeen:navigate', handleNavigate);
    element.addEventListener('yeen:media-card-state', handleMediaCardState);
    return () => {
      element.removeEventListener('yeen:navigate', handleNavigate);
      element.removeEventListener('yeen:media-card-state', handleMediaCardState);
      element.remove();
    };
  }, [
    accessToken,
    addon.id,
    addon.name,
    clientExperience,
    elementTag,
    experienceElementTags,
    mediaItem,
    remoteMusicResult,
    navigate,
    onMediaCardState,
    preparation,
    route,
    surface,
    user,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <div
      ref={containerRef}
      className={className}
      data-addon-id={addon.id}
      data-addon-surface={surface}
    >
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </div>
  );
}
