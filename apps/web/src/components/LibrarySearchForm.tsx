import type { FormEventHandler } from 'react';

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
  return (
    <form className="search-row" onSubmit={onSearchSubmit}>
      <input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder={placeholder}
        aria-label="Search media"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      <button type="submit">Search</button>
      {onOpenRandomDetails ? (
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
      ) : null}
    </form>
  );
}
