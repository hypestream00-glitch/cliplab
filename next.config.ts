import type { NextConfig } from "next";
import { UPLOAD_BODY_SIZE_LIMIT } from "./lib/config/upload-limits";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: http://localhost:3000 http://127.0.0.1:3000 ws://localhost:3000 ws://127.0.0.1:3000",
      "frame-src 'self' https://www.youtube.com https://youtube.com https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
      "form-action 'self' https://accounts.google.com https://www.tiktok.com https://www.facebook.com https://x.com https://twitter.com https://checkout.stripe.com",
    ].join("; "),
  },
];

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" });
}

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pino", "bullmq", "ioredis", "@prisma/client", "@prisma/adapter-pg", "pg", "prisma", "@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
  experimental: {
    serverActions: {
      bodySizeLimit: UPLOAD_BODY_SIZE_LIMIT,
    },
    // proxy.ts buffers POST bodies (default 10MB). Without this, MP4 uploads
    // are truncated and Server Actions throw "Unexpected end of form".
    proxyClientMaxBodySize: UPLOAD_BODY_SIZE_LIMIT,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      { source: "/health", destination: "/api/health" },
      { source: "/ready", destination: "/api/ready" },
    ];
  },
};

export default nextConfig;
