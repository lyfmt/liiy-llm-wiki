import { useEffect, useMemo, useState } from 'react';

import { getDiscovery } from '@/lib/api';
import type { DiscoveryItem, DiscoveryResponse } from '@/lib/types';

export function useDiscovery() {
  const [data, setData] = useState<DiscoveryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void getDiscovery()
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

  const firstReadable = useMemo<DiscoveryItem | null>(() => data?.sections.flatMap((section) => section.items)[0] ?? null, [data]);

  return {
    data,
    error,
    loading,
    firstReadable
  };
}
