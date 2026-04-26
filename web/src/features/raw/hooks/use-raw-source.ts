import { useEffect, useState } from 'react';

import { getRawSource } from '@/lib/api';
import type { RawSourceDetail } from '@/lib/types';

export function useRawSource(sourceId: string | undefined) {
  const [data, setData] = useState<RawSourceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(sourceId));

  useEffect(() => {
    if (!sourceId) {
      setData(null);
      setError('缺少 Raw source id');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void getRawSource(sourceId)
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
  }, [sourceId]);

  return {
    data,
    error,
    loading
  };
}
