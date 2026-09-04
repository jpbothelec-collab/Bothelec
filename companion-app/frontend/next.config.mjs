/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server bundle (.next/standalone) so the production
  // Docker image can run `node server.js` with a minimal footprint.
  output: "standalone",
};

export default nextConfig;
