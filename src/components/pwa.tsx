"use client";

import { useEffect } from "react";

/** Registers the service worker that makes the site installable (production only; nothing is cached). */
export function Pwa() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);
  return null;
}
