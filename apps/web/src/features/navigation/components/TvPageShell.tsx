import { useEffect, useRef, type PropsWithChildren } from 'react';
import {
  focusableElementsWithin,
  hasOpenDialogLayer,
  isEditableElement,
  isSelectElement,
  shouldHandleBackKey,
} from './tvDirectionalFocus.helpers';
import {
  directionForKey,
  nextDirectionalElement,
  nextElementByDomOrder,
  shouldCenterFocusedMediaTile,
} from './tvDirectionalFocus.navigation.helpers';

interface TvPageShellProps {
  pageKey: string;
  autoFocusFirst?: boolean;
}

export function TvPageShell({
  pageKey,
  autoFocusFirst = true,
  children,
}: PropsWithChildren<TvPageShellProps>) {
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const shellElement = shellRef.current;
    if (!shellElement) {
      return;
    }

    if (autoFocusFirst) {
      const frameId = window.requestAnimationFrame(() => {
        const firstFocusable = focusableElementsWithin(shellElement)[0];
        if (!firstFocusable) {
          return;
        }

        firstFocusable.focus({ preventScroll: true });
        firstFocusable.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    return;
  }, [autoFocusFirst, pageKey]);

  useEffect(() => {
    if (!shellRef.current) {
      return;
    }

    function handleDirectionalKeydown(event: KeyboardEvent) {
      const shellElement = shellRef.current;
      if (!shellElement) {
        return;
      }

      const activeElement = document.activeElement;
      if (shouldHandleBackKey(event, pageKey)) {
        if (hasOpenDialogLayer()) {
          return;
        }

        if (
          activeElement instanceof HTMLElement
          && isEditableElement(activeElement)
          && !isSelectElement(activeElement)
        ) {
          return;
        }

        const hasBackHistory = window.history.length > 1;
        const atRootRoute = window.location.pathname === '/';

        if (hasBackHistory) {
          event.preventDefault();
          window.history.back();
          return;
        }

        if (!atRootRoute) {
          event.preventDefault();
          window.location.assign('/');
        }

        return;
      }

      const direction = directionForKey(event.key);
      if (!direction) {
        return;
      }

      if (!(activeElement instanceof HTMLElement) || !shellElement.contains(activeElement)) {
        return;
      }

      const activeIsSelect = isSelectElement(activeElement);

      if (isEditableElement(activeElement) && !activeIsSelect) {
        return;
      }

      const focusables = focusableElementsWithin(shellElement);
      const focusableCandidates = focusables
        .filter((element) => element !== activeElement);

      let nextElement = nextDirectionalElement(activeElement, focusableCandidates, direction);
      if (!nextElement && activeIsSelect) {
        nextElement = nextElementByDomOrder(activeElement, focusables, direction);
      }

      if (!nextElement) {
        if (activeIsSelect) {
          event.preventDefault();
        }

        return;
      }

      event.preventDefault();
      nextElement.focus({ preventScroll: true });
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const block = shouldCenterFocusedMediaTile(activeElement, nextElement, direction)
        ? 'center'
        : 'nearest';

      nextElement.scrollIntoView({
        block,
        inline: 'nearest',
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      });
    }

    window.addEventListener('keydown', handleDirectionalKeydown, true);
    return () => {
      window.removeEventListener('keydown', handleDirectionalKeydown, true);
    };
  }, [pageKey]);

  return (
    <div ref={shellRef} className={`tv-page-shell tv-page-shell-${pageKey}`}>
      {children}
    </div>
  );
}
