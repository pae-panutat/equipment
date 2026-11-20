const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy: everything comes from this site. Inline scripts/styles are allowed because Next.js and the theme script
// are inline; the rest (no other hosts, no framing, no plugins, forms only to this site) still closes the common XSS/clickjacking routes.
// Dev additionally needs eval and a websocket for hot reload.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isProd ? "" : " ws: wss:"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []), // browsers ignore it over plain http
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Dev only: lets a phone on the same Wi-Fi open http://<this PC's IP>:3000 (e.g. to test scanning QR codes).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  // The host's Apache caches s-maxage responses; keep pages fresh after each deploy
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }, ...securityHeaders],
      },
    ];
  },
  // Local dev only: forward API calls to the Express process (same-origin for cookies).
  // In production server.js routes /api/v1 to Express before Next sees it.
  async rewrites() {
    if (process.env.NODE_ENV === "production") return [];
    return [{ source: "/api/v1/:path*", destination: `http://localhost:${process.env.API_PORT || 4000}/api/v1/:path*` }];
  },
};

export default nextConfig;
