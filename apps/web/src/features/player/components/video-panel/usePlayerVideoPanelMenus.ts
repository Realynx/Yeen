import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react';
import { clamp } from '../../services/playerUtils';
import type { PlayerContextMenuState } from './PlayerVideoPanel.types';

export type PlayerVideoPanelMenuId = null | 'audio' | 'subs' | 'settings';

interface UsePlayerVideoPanelMenusOptions {
  onRevealControls: () => void;
}

interface UsePlayerVideoPanelMenusResult {
  openMenu: PlayerVideoPanelMenuId;
  contextMenu: PlayerContextMenuState | null;
  menuRootRef: RefObject<HTMLDivElement | null>;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  toggleMenu: (menu: Exclude<PlayerVideoPanelMenuId, null>) => void;
  closeMenu: () => void;
  handleContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => void;
  runContextAction: (action: () => void) => void;
}

export function usePlayerVideoPanelMenus({
  onRevealControls,
}: UsePlayerVideoPanelMenusOptions): UsePlayerVideoPanelMenusResult {
  const [openMenu, setOpenMenu] = useState<PlayerVideoPanelMenuId>(null);
  const [contextMenu, setContextMenu] = useState<PlayerContextMenuState | null>(null);
  const menuRootRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu && !contextMenu) {
      return;
    }

    function closeOnOutside(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const inControlsMenu = menuRootRef.current?.contains(target) ?? false;
      const inContextMenu = contextMenuRef.current?.contains(target) ?? false;

      if (!inControlsMenu) {
        setOpenMenu(null);
      }

      if (!inContextMenu) {
        setContextMenu(null);
      }
    }

    function closeOnDismissKey(event: KeyboardEvent) {
      const isDismissKey = event.key === 'Escape' || event.key === 'Backspace';
      if (!isDismissKey) {
        return;
      }

      const target = event.target;
      if (
        event.key === 'Backspace' &&
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      setOpenMenu(null);
      setContextMenu(null);
    }

    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', closeOnDismissKey);

    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', closeOnDismissKey);
    };
  }, [contextMenu, openMenu]);

  function toggleMenu(menu: Exclude<PlayerVideoPanelMenuId, null>) {
    setContextMenu(null);
    setOpenMenu((previous) => (previous === menu ? null : menu));
    onRevealControls();
  }

  function closeMenu() {
    setOpenMenu(null);
  }

  function handleContextMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.shiftKey) {
      return;
    }

    event.preventDefault();
    const shellRect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 260;
    const menuHeight = 240;

    setOpenMenu(null);
    setContextMenu({
      x: clamp(event.clientX - shellRect.left, 10, Math.max(10, shellRect.width - menuWidth)),
      y: clamp(event.clientY - shellRect.top, 10, Math.max(10, shellRect.height - menuHeight)),
    });
    onRevealControls();
  }

  function runContextAction(action: () => void) {
    action();
    setContextMenu(null);
  }

  return {
    openMenu,
    contextMenu,
    menuRootRef,
    contextMenuRef,
    toggleMenu,
    closeMenu,
    handleContextMenu,
    runContextAction,
  };
}
