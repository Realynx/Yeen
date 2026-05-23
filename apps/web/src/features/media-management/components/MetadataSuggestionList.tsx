import type { MetadataSearchCandidate } from '../../shared/services/api';

interface MetadataSuggestionListProps {
  candidates: MetadataSearchCandidate[];
  loading: boolean;
  error: string | null;
  onPick: (candidate: MetadataSearchCandidate) => void;
}

export function MetadataSuggestionList({
  candidates,
  loading,
  error,
  onPick,
}: MetadataSuggestionListProps) {
  if (loading) {
    return (
      <p className="metadata-suggestions-status">Searching metadata providers…</p>
    );
  }

  if (error) {
    return (
      <p className="metadata-suggestions-status is-error" role="alert">
        {error}
      </p>
    );
  }

  if (candidates.length === 0) {
    return null;
  }

  return (
    <ul className="metadata-suggestions" role="listbox" aria-label="Metadata matches">
      {candidates.map((candidate, index) => (
        <li key={`${candidate.title}:${candidate.releaseYear ?? 'na'}:${index}`}>
          <button
            type="button"
            className="metadata-suggestion"
            onClick={() => onPick(candidate)}
          >
            {candidate.posterUrl ? (
              <img
                src={candidate.posterUrl}
                alt=""
                loading="lazy"
                decoding="async"
                className="metadata-suggestion-poster"
              />
            ) : (
              <span className="metadata-suggestion-poster is-placeholder" aria-hidden="true">
                {candidate.title.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="metadata-suggestion-body">
              <span className="metadata-suggestion-title">
                {candidate.title}
                {candidate.releaseYear ? (
                  <span className="metadata-suggestion-year"> ({candidate.releaseYear})</span>
                ) : null}
              </span>
              <span className="metadata-suggestion-source">
                {candidate.remoteSource === 'jikan' ? 'Jikan' : 'TMDB'}
              </span>
              {candidate.overview ? (
                <span className="metadata-suggestion-overview">
                  {candidate.overview}
                </span>
              ) : null}
              {candidate.tags.length > 0 ? (
                <span className="metadata-suggestion-tags">
                  {candidate.tags.slice(0, 4).join(' · ')}
                </span>
              ) : null}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
