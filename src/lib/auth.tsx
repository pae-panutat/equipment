"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { safeNextPath, type AuthUser } from "@shared/index";
import { ApiError, apiGet, apiSend, SESSION_EXPIRED_EVENT } from "./api";

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  /** Set when the server could not be reached to check the session (NOT the same as being signed out). */
  connectionError: string | null;
  /** Re-read the session from the server (after login). Throws on a network/server error. */
  refresh: () => Promise<void>;
  /** Try the session check again after a connection error. */
  retry: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

const LOGOUT_KEY = "equiplog:logout";
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000]; // then give up and show a "try again" screen

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const runId = useRef(0);

  const refresh = useCallback(async () => {
    try {
      setUser(await apiGet<AuthUser>("/auth/me"));
    } catch (e) {
      // Only a 401 means "not signed in". Anything else (server restarting, network down) must NOT look like a
      // logout: the saved sign-in is still valid, so the caller decides whether to retry.
      if (!(e instanceof ApiError && e.status === 401)) throw e;
      setUser(null);
    }
    setConnectionError(null);
    setLoading(false);
  }, []);

  // Check the session at startup. A temporary failure is retried a few times before we give up (without signing out).
  const checkSession = useCallback(async () => {
    const id = ++runId.current;
    setLoading(true);
    setConnectionError(null);
    for (let attempt = 0; ; attempt++) {
      try {
        await refresh();
        return;
      } catch {
        if (id !== runId.current) return; // superseded by a newer check
        if (attempt >= RETRY_DELAYS_MS.length) {
          setConnectionError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ในขณะนี้ (การเข้าสู่ระบบของคุณยังคงอยู่)");
          return;
        }
        await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        if (id !== runId.current) return;
      }
    }
  }, [refresh]);

  useEffect(() => {
    void checkSession();
    return () => {
      runId.current++; // stop a retry loop that is still waiting
    };
  }, [checkSession]);

  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Signed-out visitors can only see /login; signed-in users have no reason to stay on it.
  useEffect(() => {
    if (loading || connectionError) return;
    // Remember where the visitor was going (e.g. a scanned /q/<token>) and go back there after login.
    if (!user && pathname !== "/login") {
      const here = pathname + window.location.search;
      router.replace(pathname === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`);
    }
    if (user && pathname === "/login") router.replace(safeNextPath(new URLSearchParams(window.location.search).get("next")));
  }, [loading, connectionError, user, pathname, router]);

  // Signing out in one tab signs out every open tab (the "storage" event fires in the OTHER tabs only).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOGOUT_KEY && e.newValue) setUser(null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiSend("POST", "/auth/logout");
    } finally {
      setUser(null);
      try {
        localStorage.setItem(LOGOUT_KEY, String(Date.now()));
      } catch {
        // storage unavailable (private mode): other tabs will still sign out on their next request
      }
    }
  }, []);

  const retry = useCallback(() => void checkSession(), [checkSession]);
  const value = useMemo(
    () => ({ user, loading, connectionError, refresh, retry, logout }),
    [user, loading, connectionError, refresh, retry, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
