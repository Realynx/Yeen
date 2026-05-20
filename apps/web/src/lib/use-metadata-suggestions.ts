import { useEffect, useState } from 'react';
import {
  searchMetadataCandidates,
  type MetadataSearchCandidate,
} from './api';

interface UseMetadataSuggestionsOptions {
  token: string;
  title: string;
  type: 'movie' | 'show' | 'other';
  year?: number | null;
  enabled?: boolean;
  debounceMs?: number;
}

interface UseMetadataSuggestionsResult {
  candidates: MetadataSearchCandidate[];
  loading: boolean;
  error: string | null;
}

/**
 * Debounced TMDB suggestion fetcher shared by the edit + bulk-assign
 * dialogs. Cancels in-flight requests when the title changes so we
 * don't display stale results, and quietly returns an empty list when
 * the input is too short or the API key isn't configured.
 */
export function useMetadataSuggestions(
  options: UseMetadataSuggestionsOptions,
): UseMetadataSuggestionsResult {
  const {
    token,
    title,
    type,
    year,
    enabled = true,
    debounceMs = 350,
  } = options;

  const [candidates, setCandidates] = useState<MetadataSearchCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = title.trim();

  useEffect(() => {
    if (!enabled || trimmed.length < 2) {
      setCandidates([]);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await searchMetadataCandidates(token, {
          title: trimmed,
          type,
          year: year ?? null,
          limit: 6,
          signal: controller.signal,
        });
        setCandidates(result.candidates);
      } catch (lookupError) {
        if (controller.signal.aborted) return;
        setCandidates([]);
        setError(
          lookupError instanceof Error
            ? lookupError.message
            : 'Lookup failed.',
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, debounceMs);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [token, trimmed, type, year, enabled, debounceMs]);

  return { candidates, loading, error };
}
