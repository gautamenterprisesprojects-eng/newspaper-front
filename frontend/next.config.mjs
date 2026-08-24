/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required by frontend/Dockerfile, which copies .next/standalone.
  output: "standalone",
  reactStrictMode: true,
  compiler: {
    // Strips every console.* call from the production client bundle at
    // build time. Source maps are already off by default
    // (productionBrowserSourceMaps unset), so this closes the other half
    // of "no code/internals visible via inspect".
    removeConsole: process.env.NODE_ENV === "production",
  },
};

export default nextConfig;
