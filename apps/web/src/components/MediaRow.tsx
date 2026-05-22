import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface MediaRowProps {
  children: ReactNode;
}

export function MediaRow({ children }: MediaRowProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }

    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = scrollerRef.current;
    if (!el) {
      return;
    }

    const handleScroll = () => updateScrollState();
    el.addEventListener('scroll', handleScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateScrollState());
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [updateScrollState]);

  const scrollByPage = useCallback((direction: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) {
      return;
    }

    const viewportWidth = el.parentElement instanceof HTMLElement
      ? el.parentElement.clientWidth
      : el.clientWidth;
    const amount = Math.max(viewportWidth * 0.85, 240);
    el.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }, []);

  return (
    <div className="media-row-wrapper">
      <button
        type="button"
        className="media-row-arrow media-row-arrow-left"
        aria-label="Scroll left"
        onClick={() => scrollByPage(-1)}
        disabled={!canScrollLeft}
        tabIndex={canScrollLeft ? 0 : -1}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="media-row" ref={scrollerRef}>
        {children}
      </div>

      <button
        type="button"
        className="media-row-arrow media-row-arrow-right"
        aria-label="Scroll right"
        onClick={() => scrollByPage(1)}
        disabled={!canScrollRight}
        tabIndex={canScrollRight ? 0 : -1}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
