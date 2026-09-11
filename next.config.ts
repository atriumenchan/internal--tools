import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["xlsx"],
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns"],
  },
};

export default nextConfig;
