"use client";

import { API_PREFIX } from "@shared/index";

// Live updates. One shared timer asks the server every few seconds for a small "token" that changes whenever anything the
// signed-in user may see is added or changed. When the token changes, every subscribed screen reloads its own data quietly.
// Plain short polling (not WebSocket/SSE) because the shared host's Apache/Passenger front end does not reliably keep long
// connections open; it works everywhere and costs one tiny request per open tab.
const INTERVAL_MS = 5000;

const subscribers = new Set<() => void>();
let token: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let polling = false;

async function poll() {
  if (polling || document.hidden) return; // a hidden tab asks for nothing; it catches up when it is shown again
  polling = true;
  try {
    const res = await fetch(`${API_PREFIX}/pulse`, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!res.ok) return;
    const next = ((await res.json()) as { token?: string }).token ?? null;
    if (token !== null && next !== null && next !== token) subscribers.forEach((fn) => fn());
    if (next !== null) token = next;
  } catch {
    /* offline or a hiccup: try again at the next tick */
  } finally {
    polling = false;
  }
}

const onVisible = () => {
  if (!document.hidden) void poll();
};

/** Call `fn` whenever the data changes on the server. Returns the function that stops listening. */
export function subscribePulse(fn: () => void): () => void {
  subscribers.add(fn);
  if (!timer) {
    timer = setInterval(() => void poll(), INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisible);
    void poll(); // sets the starting token
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
      token = null;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}
