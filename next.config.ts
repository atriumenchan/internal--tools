import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["xlsx", "exceljs"],
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "date-fns"],
  },
};

export default nextConfig;
