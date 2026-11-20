// In-memory login throttle. Each key counts failures inside a 15-minute window and is locked once it reaches its limit.
// (One process on this host; if the app is ever scaled out, move this to the database.)
const WINDOW_MS = 15 * 60_000;
const hits = new Map<string, { count: number; first: number }>();

/** Failures allowed per window: one person on one address, one account from anywhere, one address against any account. */
const LIMITS = { pair: 5, user: 20, ip: 40 } as const;

const keysFor = (ip: string, username: string) => [
  { key: `pair|${ip}|${username}`, max: LIMITS.pair },
  { key: `user|${username}`, max: LIMITS.user }, // many addresses against one account
  { key: `ip|${ip}`, max: LIMITS.ip }, // one address spraying many accounts
];

function locked(key: string, max: number): boolean {
  const h = hits.get(key);
  if (!h) return false;
  if (Date.now() - h.first > WINDOW_MS) {
    hits.delete(key);
    return false;
  }
  return h.count >= max;
}

export function isLocked(ip: string, username: string): boolean {
  return keysFor(ip, username).some((k) => locked(k.key, k.max));
}

export function recordFailure(ip: string, username: string): void {
  const now = Date.now();
  for (const { key } of keysFor(ip, username)) {
    const h = hits.get(key);
    if (!h || now - h.first > WINDOW_MS) hits.set(key, { count: 1, first: now });
    else h.count++;
  }
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.first > WINDOW_MS) hits.delete(k);
}

/** A correct sign-in clears only the person's own counter, so it cannot be used to reset the shared ones. */
export function clearFailures(ip: string, username: string): void {
  hits.delete(`pair|${ip}|${username}`);
}
