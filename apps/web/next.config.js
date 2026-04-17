import { next } from "next";

export default function NextConfig() {
  return {
    reactStrictMode: true,
    transpilePackages: ["@repo/shared", "@repo/database"],
    experimental: {
      serverComponentsExternalPackages: ["@prisma/client"],
    },
  };
}

module.exports = {
  reactStrictMode: true,
  transpilePackages: ["@repo/shared", "@repo/database"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
};
