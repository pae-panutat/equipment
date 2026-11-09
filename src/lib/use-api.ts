"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./api";

type State<T> = { data: T | null; error: string | null; loading: boolean };

/** Load a JSON endpoint; re-runs when the path/params change. Errors stay errors (never shown as empty data). */
export function useApi<T>(path: string, params?: Record<string, string | number | null | undefined>) {
  const key = JSON.stringify(params ?? {});
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    apiGet<T>(path, JSON.parse(key), ctrl.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setState({ data: null, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด", loading: false });
      });
    return () => ctrl.abort();
  }, [path, key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
