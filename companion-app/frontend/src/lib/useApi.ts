"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";

interface State<T> {
  data: T | null;
  error: string | null;
  status: number | null; // HTTP status of a failed request (e.g. 404), when known
  loading: boolean;
  reload: () => void;
}

/** Fetch-on-mount hook for a promise-returning API call. */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    setStatus(null);
    run()
      .then((d) => live && setData(d))
      .catch((e) => {
        if (!live) return;
        setError(e instanceof ApiError ? e.message : "Something went wrong.");
        setStatus(e instanceof ApiError ? e.status : null);
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [run, nonce]);

  return { data, error, status, loading, reload: () => setNonce((n) => n + 1) };
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
