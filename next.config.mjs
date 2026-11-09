/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained build for Passenger/Node.js Selector
  output: "standalone",
  // The host's Apache caches s-maxage responses; keep pages fresh after each deploy
  async headers() {
    return [
      {
        source: "/((?!_next/static|_next/image).*)",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
