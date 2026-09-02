"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** Fetch-on-mount hook for a promise-returning API call. */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    run()
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e instanceof ApiError ? e.message : "Something went wrong."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [run, nonce]);

  return { data, error, loading, reload: () => setNonce((n) => n + 1) };
}

/** Wrap an async action with loading + error state for buttons/forms. */
export function useAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, []);
  return { loading, error, run, setError };
}
