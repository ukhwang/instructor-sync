import type { NextConfig } from "next";
import path from "path";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
};

// Exposes Cloudflare bindings (D1 `DB`, vars, secrets from .dev.vars) to `next dev`.
initOpenNextCloudflareForDev();

export default nextConfig;
