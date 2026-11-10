import { API_PREFIX } from "@shared/index";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// How many requests are in flight right now; the loading bar watches this.
let pending = 0;
const listeners = new Set<() => void>();
export const subscribePending = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
export const getPending = () => pending;
function track<T>(p: Promise<T>): Promise<T> {
  pending++;
  listeners.forEach((f) => f());
  return p.finally(() => {
    pending--;
    listeners.forEach((f) => f());
  });
}

/** Fired when the server says the session is gone, so the app can send the user back to the login page. */
export const SESSION_EXPIRED_EVENT = "equiplog:session-expired";

async function toError(res: Response): Promise<ApiError> {
  let message = "เกิดข้อผิดพลาดในการโหลดข้อมูล";
  try {
    message = (await res.json())?.error?.message ?? message;
  } catch {
    /* keep default */
  }
  return new ApiError(message, res.status);
}

/** GET a JSON endpoint. Errors are thrown (never turned into empty/zero data). */
export async function apiGet<T>(path: string, params?: Record<string, string | number | null | undefined>, signal?: AbortSignal): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
  const query = qs.toString(); // (not qs.size: that is missing in browsers older than Chrome 113 / Safari 17)
  const res = await track(fetch(`${API_PREFIX}${path}${query ? `?${query}` : ""}`, { signal, headers: { Accept: "application/json" } }));
  if (!res.ok) {
    if (res.status === 401 && path !== "/auth/me" && typeof window !== "undefined") window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw await toError(res);
  }
  return res.json() as Promise<T>;
}

/** POST/PATCH a JSON body. */
export async function apiSend<T = { ok: true }>(method: "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const res = await track(fetch(`${API_PREFIX}${path}`, {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  if (!res.ok) throw await toError(res);
  return res.json() as Promise<T>;
}
