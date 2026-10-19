import { useCallback, useEffect, useRef, useState } from 'react';

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

// Plan 242: shared read-path hook. Semantics copied from useProductsQuery
// (plans 088/094): a monotonic request id means a slow older response can
// never overwrite a newer one, `loading` stays true while the newest request
// is in flight, `error` is the thrown Error's message, and `reload` re-runs
// the latest fetcher. The mounted flag extends the same guard across unmount
// (no setState after the component is gone). Callers pass their own `deps`
// to re-fetch when inputs change, mirroring useProductsQuery's dependency
// list; `reload` keeps a stable identity while `deps` are unchanged.
export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const mounted = useRef(true);
  // The latest fetcher for the current render — `load` itself stays tied to
  // `deps`, so an effect can depend on it without re-running per render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (!mounted.current || seq !== requestSeq.current) return;
      setData(result);
    } catch (err) {
      if (!mounted.current || seq !== requestSeq.current) return;
      setError((err as Error).message);
    } finally {
      if (mounted.current && seq === requestSeq.current) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load };
}
