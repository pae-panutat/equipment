"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "./api";
import { subscribePulse } from "./pulse";

type State<T> = { data: T | null; error: string | null; loading: boolean };

/**
 * Load a JSON endpoint; re-runs when the path/params change. Errors stay errors (never shown as empty data).
 * With `live`, the data also reloads quietly (no spinner, nothing cleared) whenever the server reports a change;
 * `liveTick` goes up each time that happens, so a screen can tell a live update from a normal load.
 */
export function useApi<T>(path: string, params?: Record<string, string | number | null | undefined>, opts?: { live?: boolean }) {
  const key = JSON.stringify(params ?? {});
  const live = opts?.live === true;
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const [liveTick, setLiveTick] = useState(0);
  const loadingRef = useRef(true);

  useEffect(() => {
    const ctrl = new AbortController();
    loadingRef.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    apiGet<T>(path, JSON.parse(key), ctrl.signal)
      .then((data) => {
        loadingRef.current = false;
        setState({ data, error: null, loading: false });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        loadingRef.current = false;
        setState({ data: null, error: e instanceof Error ? e.message : "เกิดข้อผิดพลาด", loading: false });
      });
    return () => ctrl.abort();
  }, [path, key, tick]);

  useEffect(() => {
    if (!live) return;
    let ctrl: AbortController | null = null;
    const off = subscribePulse(() => {
      if (loadingRef.current) return; // a normal load is already running and will bring the latest data
      ctrl?.abort();
      const mine = (ctrl = new AbortController());
      apiGet<T>(path, JSON.parse(key), mine.signal, true)
        .then((data) => {
          if (mine.signal.aborted) return;
          setState({ data, error: null, loading: false });
          setLiveTick((n) => n + 1);
        })
        .catch(() => {
          /* keep showing what is on screen; the next change tries again */
        });
    });
    return () => {
      off();
      ctrl?.abort();
    };
  }, [live, path, key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload, liveTick };
}
