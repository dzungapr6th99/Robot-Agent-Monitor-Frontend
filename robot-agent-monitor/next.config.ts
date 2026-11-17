import type { NextConfig } from "next";
import settings from "./appsettings.json";

const target = (process.env.BACKEND_URL ?? settings.BACKEND_URL).replace(
  /\/$/,
  "",
);
const apiBase = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? settings.NEXT_PUBLIC_API_BASE_URL
).replace(/\/$/, "");
const uploadLimit = Number(
  process.env.NEXT_PUBLIC_URDF_MAX_BYTES ?? settings.NEXT_PUBLIC_URDF_MAX_BYTES,
);

if (!Number.isSafeInteger(uploadLimit) || uploadLimit <= 0) {
  throw new Error("NEXT_PUBLIC_URDF_MAX_BYTES must be a positive integer");
}

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: { proxyTimeout: settings.BACKEND_PROXY_TIMEOUT_MS },
  allowedDevOrigins: settings.ALLOWED_DEV_ORIGINS,
  env: {
    NEXT_PUBLIC_API_BASE_URL: apiBase,
    NEXT_PUBLIC_URDF_MAX_BYTES: String(uploadLimit),
    NEXT_PUBLIC_VLA_COMMAND_TIMEOUT_MS: String(
      settings.BACKEND_PROXY_TIMEOUT_MS,
    ),
  },
  async rewrites() {
    if (!apiBase.startsWith("/") || apiBase.startsWith("//")) return [];
    return [{ source: `${apiBase}/:path*`, destination: `${target}/:path*` }];
  },
};

export default nextConfig;
