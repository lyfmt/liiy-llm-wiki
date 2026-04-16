import { useEffect, useState } from 'react';

import { getKnowledgePage } from '@/lib/api';
import type { KnowledgePageResponse } from '@/lib/types';

export function useKnowledgePage(kind: string | undefined, slug: string | undefined) {
  const [data, setData] = useState<KnowledgePageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!kind || !slug) {
      setError('Invalid page route.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void getKnowledgePage(kind, slug)
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
  }, [kind, slug]);

  return {
    data,
    error,
    loading
  };
}
