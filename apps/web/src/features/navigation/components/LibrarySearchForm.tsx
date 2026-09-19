import {
  useCallback,
  useRef,
  useState,
  type FocusEventHandler,
  type FormEventHandler,
  type KeyboardEventHandler,
} from 'react';
import { useClientExperience } from '../services/clientExperience';

interface LibrarySearchFormProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSearchSubmit: FormEventHandler<HTMLFormElement>;
  placeholder?: string;
  onOpenRandomDetails?: (() => void | Promise<void>) | null;
  randomDisabled?: boolean;
}

export function LibrarySearchForm({
  query,
  onQueryChange,
  onSearchSubmit,
  placeholder = 'Search titles and paths',
  onOpenRandomDetails = null,
  randomDisabled = false,
}: LibrarySearchFormProps) {
  const experience = useClientExperience();
  const isTvMode = experience === 'tv';
  const [tvSearchActive, setTvSearchActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const activateButtonRef = useRef<HTMLButtonElement | null>(null);

  const activateTvSearch = useCallback(() => {
    setTvSearchActive(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const collapseTvSearch = useCallback(() => {
    if (!isTvMode) {
      return;
    }

    setTvSearchActive(false);
    window.requestAnimationFrame(() => {
      activateButtonRef.current?.focus({ preventScroll: true });
    });
  }, [isTvMode]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (event) => {
    onSearchSubmit(event);
    if (isTvMode) {
      inputRef.current?.blur();
      setTvSearchActive(false);
    }
  };

  const handleInputKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (isTvMode && (event.key === 'Escape' || event.key === 'Backspace') && !query) {
      event.preventDefault();
      collapseTvSearch();
    }
  };

  const handleFormBlur: FocusEventHandler<HTMLFormElement> = (event) => {
    if (
      isTvMode
      && !event.currentTarget.contains(event.relatedTarget as Node | null)
    ) {
      setTvSearchActive(false);
    }
  };

  const randomButton = onOpenRandomDetails ? (
    <button
      type="button"
      className="search-random-button"
      onClick={() => {
        void onOpenRandomDetails();
      }}
      aria-label="Open a random media details page"
      title="Random media"
      disabled={randomDisabled}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="8.25" cy="8.25" r="1.2" fill="currentColor" />
        <circle cx="15.75" cy="8.25" r="1.2" fill="currentColor" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        <circle cx="8.25" cy="15.75" r="1.2" fill="currentColor" />
        <circle cx="15.75" cy="15.75" r="1.2" fill="currentColor" />
      </svg>
    </button>
  ) : null;

  if (isTvMode && !tvSearchActive) {
    return (
      <form className="search-row search-row-tv-activation" onSubmit={(event) => {
        event.preventDefault();
        activateTvSearch();
      }}>
        <button
          ref={activateButtonRef}
          type="button"
          className="search-tv-activate-button"
          onClick={activateTvSearch}
          aria-label={query ? `Edit search for ${query}` : 'Search media'}
        >
          {query ? `Search: ${query}` : 'Search'}
        </button>
        {randomButton}
      </form>
    );
  }

  return (
    <form className="search-row" onSubmit={handleSubmit} onBlur={handleFormBlur}>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        aria-label="Search media"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        data-tv-text-entry={isTvMode ? 'true' : undefined}
      />
      <button type="submit">Search</button>
      {randomButton}
    </form>
  );
}
