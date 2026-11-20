import type { NextConfig } from "next";
import path from "path";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/** Capability URLs (/h/<token>, /report/<token>) must not leak via Referer or be indexed. */
const capabilityPageHeaders = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async headers() {
    return [
      { source: "/h/:token*", headers: capabilityPageHeaders },
      { source: "/report/:token*", headers: capabilityPageHeaders },
    ];
  },
};

// Exposes Cloudflare bindings (D1 `DB`, vars, secrets from .dev.vars) to `next dev`.
initOpenNextCloudflareForDev();

export default nextConfig;
