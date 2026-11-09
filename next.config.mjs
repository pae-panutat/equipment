/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained build for Passenger/Node.js Selector (no npm install needed on host)
  output: "standalone",
};

export default nextConfig;
