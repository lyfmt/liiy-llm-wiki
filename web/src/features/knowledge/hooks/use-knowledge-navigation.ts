import { useEffect, useState } from 'react';

import { getKnowledgeNavigation } from '@/lib/api';
import type { KnowledgeNavigationResponse } from '@/lib/types';

export function useKnowledgeNavigation() {
  const [data, setData] = useState<KnowledgeNavigationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void getKnowledgeNavigation()
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
