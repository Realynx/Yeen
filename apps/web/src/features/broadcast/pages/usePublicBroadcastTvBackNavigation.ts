import { useEffect } from 'react';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

export function usePublicBroadcastTvBackNavigation(isTvExperience: boolean) {
  useEffect(() => {
    if (!isTvExperience) {
      return;
    }

    function handleTvBackKey(event: KeyboardEvent) {
      const isBackKey = event.key === 'Escape' || event.key === 'Backspace';
      if (!isBackKey) {
        return;
      }

      if (event.key === 'Backspace' && isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.assign('/');
    }

    document.addEventListener('keydown', handleTvBackKey, true);

    return () => {
      document.removeEventListener('keydown', handleTvBackKey, true);
    };
  }, [isTvExperience]);
}
