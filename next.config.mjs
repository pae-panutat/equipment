/** @type {import('next').NextConfig} */
const nextConfig = {
  // The host's Apache caches s-maxage responses; keep pages fresh after each deploy
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
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
