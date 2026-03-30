import { existsSync, mkdirSync } from "node:fs";
import type { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { safeTry } from "slang-ts";
import type { ServerRuntime } from "@/nile/types";
import type { RestConfig } from "./types";

const ASSETS_REGEX = /^\/assets\//;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_RATE_LIMIT_MAX = 100;

/**
 * Applies rate limiting middleware when a limiting header is configured.
 * Extracts the client key from the configured request header for per-client tracking.
 * Falls back to IP-based rate limiting when the configured header is absent.
 */
export function applyRateLimiting(
  app: Hono,
  config: RestConfig,
  log: (msg: string, data?: unknown) => void
): void {
  if (!config.rateLimiting?.limitingHeader) {
    return;
  }

  const { rateLimiting } = config;

  app.use(
    rateLimiter({
      windowMs: rateLimiting.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS,
      limit: rateLimiting.limit ?? DEFAULT_RATE_LIMIT_MAX,
      standardHeaders: rateLimiting.standardHeaders ?? true,
      keyGenerator: (c) => {
        const key = c.req.header(rateLimiting.limitingHeader);
        if (key) {
          return key;
        }
        // Fall back to IP-based rate limiting when the configured header is absent
        const ip =
          c.req.header("x-forwarded-for") ??
          c.req.header("x-real-ip") ??
          "unknown-client";
        log(
          `Rate limiting header '${rateLimiting.limitingHeader}' missing — falling back to IP: ${ip}`
        );
        return ip;
      },
      store: rateLimiting.store ?? undefined,
    })
  );

  log(
    `Rate limiting enabled: ${rateLimiting.limit ?? DEFAULT_RATE_LIMIT_MAX} requests per ${rateLimiting.windowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS}ms window`
  );
}

/** Maps each supported runtime to its Hono serveStatic adapter module path */
const STATIC_ADAPTER_MODULES: Record<ServerRuntime, string> = {
  bun: "hono/bun",
  node: "@hono/node-server/serve-static",
};

/**
 * Applies static file serving at /assets/*.
 * The root directory defaults to "./assets" and is created automatically if missing.
 * Dynamically imports the runtime-specific serveStatic adapter (Bun or Node),
 * avoiding issues with runtime globals at module-load time (e.g. Bun globals in vitest).
 * Import errors are caught gracefully — static serving is skipped if the adapter fails to load.
 */
export function applyStaticServing(
  app: Hono,
  config: RestConfig,
  runtime: ServerRuntime,
  log: (msg: string, data?: unknown) => void
): void {
  if (!config.enableStatic) {
    return;
  }

  const adapterModule = STATIC_ADAPTER_MODULES[runtime];
  if (!adapterModule) {
    log(`Static file serving not supported for runtime: ${runtime}`);
    return;
  }

  const staticDir = config.staticDir ?? "./assets";

  // Auto-create the static directory if it doesn't exist
  if (!existsSync(staticDir)) {
    mkdirSync(staticDir, { recursive: true });
    log(`Created static directory: ${staticDir}`);
  }

  // Lazy-load the runtime-specific serveStatic adapter
  let cachedHandler:
    | ((c: never, next: never) => Promise<Response | undefined>)
    | null = null;
  let importFailed = false;

  app.use("/assets/*", async (c, next) => {
    if (importFailed) {
      return next();
    }

    if (!cachedHandler) {
      const importResult = await safeTry(async () => {
        const mod = await import(adapterModule);
        return mod.serveStatic({
          root: staticDir,
          rewriteRequestPath: (path: string) => path.replace(ASSETS_REGEX, ""),
        });
      });

      if (importResult.isErr) {
        log(
          `Failed to load static file adapter for ${runtime}`,
          importResult.error
        );
        importFailed = true;
        return next();
      }

      cachedHandler = importResult.value as unknown as typeof cachedHandler;
    }

    if (cachedHandler) {
      return cachedHandler(c as never, next as never);
    }
  });

  log(
    `Static file serving enabled at /assets/* from ${staticDir} (runtime: ${runtime})`
  );
}
