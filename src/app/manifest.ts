import type { MetadataRoute } from "next";

// Lets the site be installed on a phone or computer ("Add to Home screen"): its own icon, opens full-screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CMU Asset & Maintenance",
    short_name: "CMU Asset",
    description: "ระบบทะเบียนอุปกรณ์และติดตามการบำรุงรักษา",
    lang: "th",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0c0716",
    theme_color: "#7c3aed",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
