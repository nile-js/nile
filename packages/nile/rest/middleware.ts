import type { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { safeTry } from "slang-ts";
import type { ServerRuntime } from "@/nile/types";
import type { RestConfig } from "./types";

const ASSETS_REGEX = /^\/assets\//;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_RATE_LIMIT_MAX = 100;
const UNKNOWN_CLIENT_KEY = "__unknown_client__";

/**
 * Applies rate limiting middleware when a limiting header is configured.
 * Extracts the client key from the configured request header for per-client tracking.
 * Falls back to a shared key when the header is missing (graceful degradation).
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
        if (!key) {
          log(
            `Rate limiting header '${rateLimiting.limitingHeader}' missing from request`
          );
          return UNKNOWN_CLIENT_KEY;
        }
        return key;
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
 * Applies static file serving from ./assets at /assets/*.
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
          root: "./assets",
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

  log(`Static file serving enabled at /assets/* (runtime: ${runtime})`);
}
