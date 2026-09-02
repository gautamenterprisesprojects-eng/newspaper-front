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
  // The public marketing landing page is switched off: hitting the site root
  // lands straight on the login screen instead. 307 (permanent: false) on
  // purpose -- a 308 would be cached by every visitor's browser and would
  // keep redirecting them long after the landing page is turned back on.
  // src/app/page.tsx is left untouched, so re-enabling is deleting this
  // redirects() block and nothing else.
  async redirects() {
    return [{ source: "/", destination: "/login", permanent: false }];
  },
};

export default nextConfig;
