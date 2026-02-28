# REST Interface

**Type:** Reference / Specification
**Path:** `src/rest/`

## 1. Purpose

The REST interface exposes the Action Engine over HTTP via Hono. It implements a single-POST-endpoint architecture where all service communication flows through one route, discriminated by an `intent` field in the request body.

### 1.1 Responsibilities

- **Request validation** — Validates incoming JSON against a Zod schema before processing
- **Intent routing** — Dispatches `explore`, `execute`, and `schema` intents to dedicated handlers
- **Response mapping** — Converts internal `Result<T, E>` types to the `ExternalResponse` shape at the HTTP boundary
- **Middleware application** — CORS, rate limiting, and static file serving
- **Diagnostics** — Emit request routing information via `createDiagnosticsLog` from `src/utils.ts` when `diagnostics` is enabled. See `docs/internals/logging.md` section 7.

### 1.2 Non-Goals

- **Business logic** — The REST layer does not contain domain logic. It delegates to the engine.
- **Authentication** — Not yet implemented. Request context (headers, cookies) is available via `NileContext.rest`.
- **File uploads** — `RestConfig.uploads` is defined in types but not yet implemented.

## 2. Architecture

The REST module is split into three files to stay under the 400 LOC limit:

| File | LOC | Responsibility |
|------|-----|----------------|
| `rest.ts` | 136 | Hono app factory, request validation, route registration |
| `intent-handlers.ts` | 236 | Explore, execute, schema handlers, `toExternalResponse`, `intentHandlers` lookup |
| `middleware.ts` | 108 | `applyRateLimiting`, `applyStaticServing` |

## 3. Endpoints

### 3.1 `POST {baseUrl}/services`

The single endpoint for all service interactions. The request body must conform to `ExternalRequest`:

```typescript
{
  intent: "explore" | "execute" | "schema";
  service: string;   // service name or "*" for wildcard
  action: string;    // action name or "*" for wildcard
  payload: Record<string, unknown>;
}
```

The body is validated against a Zod schema. Invalid JSON or missing fields return `400`.

### 3.2 `GET /status`

Health check endpoint. Only registered when `config.enableStatus` is `true`.

Returns:
```json
{ "status": true, "message": "{serverName} is running", "data": {} }
```

### 3.3 404 Handler

All unmatched routes return:
```json
{
  "status": false,
  "message": "Route not found. Use POST {baseUrl}/services for all operations.",
  "data": {}
}
```

## 4. Intent Handlers

Intent dispatch uses an object lookup (`intentHandlers`) rather than switch/if-else.

### 4.1 Explore

Discovers services and actions.

| `service` | `action` | Behavior |
|-----------|----------|----------|
| `"*"` | any | List all services via `engine.getServices()` |
| `"name"` | `"*"` | List actions for service via `engine.getServiceActions()` |
| `"name"` | `"name"` | Return action metadata (name, description, isProtected, accessControl, hooks, meta) |

### 4.2 Execute

Runs an action through the engine pipeline. Wildcards are rejected — both `service` and `action` must be specific.

Calls `engine.executeAction(service, action, payload, nileContext)` and maps the result.

### 4.3 Schema

Exports Zod validation schemas as JSON Schema (via `z.toJSONSchema()` from Zod v4).

| `service` | `action` | Behavior |
|-----------|----------|----------|
| `"*"` | any | All schemas across all services |
| `"name"` | `"*"` | All schemas in a service |
| `"name"` | `"name"` | Single action schema |

Actions without a `validation` schema return `null`. Schema conversion failures are caught by `safeTrySync` and also return `null`.

## 5. Response Format

All responses use the `ExternalResponse` shape:

```typescript
{
  status: boolean;
  message: string;
  data: {
    error_id?: string;
    [key: string]: unknown;
  };
}
```

The `toExternalResponse` function handles the `Result` to `ExternalResponse` mapping:
- `Ok(value)` — if value is a plain object, it becomes `data` directly. Arrays and primitives are wrapped as `{ result: value }`.
- `Err(message)` — `status: false`, message is the error string, `data` is empty.

HTTP status codes: `200` for success, `400` for failures and validation errors, `404` for unmatched routes.

## 6. Middleware

### 6.1 CORS

Applied first via `applyCorsConfig` from `src/cors/cors.ts`. See `docs/internals/cors.md`.

### 6.2 Rate Limiting

**File:** `src/rest/middleware.ts` — `applyRateLimiting`

Only applied when `config.rateLimiting.limitingHeader` is set. Uses `hono-rate-limiter`.

- Client key is extracted from the configured request header
- If the header is missing, falls back to a shared `__unknown_client__` key (graceful degradation, not a crash)
- Defaults: 100 requests per 15-minute window

### 6.3 Static File Serving

**File:** `src/rest/middleware.ts` — `applyStaticServing`

Only applied when `config.enableStatic` is `true` and `runtime` is `"bun"`.

- Serves files from `./assets` at `/assets/*`
- Uses dynamic `import("hono/bun")` to avoid referencing Bun globals at import time
- The import result is cached after first successful load
- Import failures are caught by `safeTry` — static serving is silently skipped

## 7. Key Types

### 7.1 `RestConfig`

```typescript
{
  baseUrl: string;
  host?: string;
  port?: number;
  diagnostics?: boolean;
  enableStatic?: boolean;
  enableStatus?: boolean;
  rateLimiting?: RateLimitConfig;
  allowedOrigins: string[];
  cors?: CorsConfig;
  uploads?: { /* not yet implemented */ };
}
```

### 7.2 `RateLimitConfig`

```typescript
{
  windowMs?: number;          // default: 900000 (15 min)
  limit?: number;             // default: 100
  standardHeaders?: boolean;  // default: true
  limitingHeader: string;     // required — header name for client key
  store?: Store;              // custom rate limiter store
  diagnostics?: boolean;
}
```

### 7.3 `ExternalRequest`

```typescript
{
  intent: "explore" | "execute" | "schema";
  service: string;
  action: string;
  payload: Record<string, unknown>;
}
```

### 7.4 `ExternalResponse`

```typescript
{
  status: boolean;
  message: string;
  data: { error_id?: string; [key: string]: unknown };
}
```

## 8. Constraints

- **Single POST endpoint** — All service interactions go through `POST {baseUrl}/services`. No per-action routes.
- **No streaming** — Responses are JSON only. No SSE or chunked transfer.
- **Bun-only static serving** — Node.js runtime skips static file serving with a diagnostic log.
- **Rate limiter requires header** — Without `limitingHeader`, rate limiting is not applied at all.

## 9. Failure Modes

- **Invalid JSON body** — Returns `400` with "Invalid or missing JSON body"
- **Schema validation failure** — Returns `400` with Zod issue details in `data.errors`
- **Wildcard in execute** — Returns `400` with descriptive message
- **Missing service/action** — Engine returns `Err`, mapped to `400` via `toExternalResponse`
- **Handler crash** — Caught by `safeTry` in the engine pipeline, returned as `Err`
