// In-memory login throttle: 5 failures per key within 15 minutes locks that key for the rest of the window.
// (One process on this host; if the app is ever scaled out, move this to the database.)
const WINDOW_MS = 15 * 60_000;
const MAX_FAILS = 5;
const hits = new Map<string, { count: number; first: number }>();

export function isLocked(key: string): boolean {
  const h = hits.get(key);
  if (!h) return false;
  if (Date.now() - h.first > WINDOW_MS) {
    hits.delete(key);
    return false;
  }
  return h.count >= MAX_FAILS;
}

export function recordFailure(key: string): void {
  const h = hits.get(key);
  if (!h || Date.now() - h.first > WINDOW_MS) hits.set(key, { count: 1, first: Date.now() });
  else h.count++;
  if (hits.size > 5000) for (const [k, v] of hits) if (Date.now() - v.first > WINDOW_MS) hits.delete(k);
}

export function clearFailures(key: string): void {
  hits.delete(key);
}
