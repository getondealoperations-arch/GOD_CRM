import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every CRM page is per-user and dynamic, so Cache Components (static shell + "use cache") is left off.
  // forbidden() → real 403 + app/forbidden.tsx when a role lacks a permission
  experimental: { authInterrupts: true },
};

export default nextConfig;
