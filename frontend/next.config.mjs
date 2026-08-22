/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required by frontend/Dockerfile, which copies .next/standalone.
  output: "standalone",
  reactStrictMode: true,
};

export default nextConfig;
