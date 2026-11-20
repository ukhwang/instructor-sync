import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext adapter config.
 *
 * Every trainer page is dynamic (session-bound) and the public member pages are
 * rendered per request, so no incremental cache store is configured. Static
 * assets are served by the Workers assets binding with immutable caching.
 *
 * Optional (not required for correctness): an R2 incremental cache can be added
 * later with `@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache`
 * plus an R2 bucket binding. See docs/CLOUDFLARE_MIGRATION.md.
 */
export default defineCloudflareConfig({});
