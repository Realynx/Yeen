import { useEffect, useRef, type RefObject } from 'react';

export function usePlayerMenuInitialFocus(open: boolean): RefObject<HTMLDivElement | null> {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const target = menuRef.current?.querySelector<HTMLElement>(
        '[data-tv-menu-initial-focus="true"], button:not([disabled])',
      );
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [open]);

  return menuRef;
}
