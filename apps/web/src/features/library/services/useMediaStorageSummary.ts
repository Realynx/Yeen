import { useEffect, useState } from 'react';
import { getMediaStorageSummary } from '../../shared/services/api';
import type { MediaStorageSummary } from '../../shared/services/types';

interface UseMediaStorageSummaryResult {
  summary: MediaStorageSummary | null;
  loading: boolean;
  error: string | null;
}

export function useMediaStorageSummary(
  token: string,
): UseMediaStorageSummaryResult {
  const [summary, setSummary] = useState<MediaStorageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStorageSummary() {
      setLoading(true);
      setError(null);

      try {
        const response = await getMediaStorageSummary(token);
        if (!cancelled) {
          setSummary(response);
        }
      } catch {
        if (!cancelled) {
          setSummary(null);
          setError('Storage metrics unavailable.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadStorageSummary();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return {
    summary,
    loading,
    error,
  };
}
