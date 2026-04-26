import { useEffect, useState } from 'react';

import { getSources } from '@/lib/api';
import type { SourceSummary } from '@/lib/types';

export function useRawSources() {
  const [data, setData] = useState<SourceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void getSources()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    data,
    error,
    loading
  };
}
