import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@repo/shared", "@repo/database"],
  serverExternalPackages: ["@prisma/client", "redis"],
};

// Skip Sentry in development — it adds 500+ second compile times
const isDev = process.env.NODE_ENV === "development";
export default isDev
  ? nextConfig
  : withSentryConfig(nextConfig, { silent: true, telemetry: false });
