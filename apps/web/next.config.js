/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@repo/shared", "@repo/database"],
  // Keep these out of webpack bundling — they use native bindings or
  // dynamic requires that break when bundled for serverless.
  serverExternalPackages: ["@prisma/client", "redis", "bullmq", "ioredis"],
};

export default nextConfig;
