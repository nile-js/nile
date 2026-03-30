# REST Interface

**Type:** Reference / Specification
**Path:** `rest/`

## 1. Purpose

The REST interface exposes the Action Engine over HTTP via Hono. It implements a single-POST-endpoint architecture where all service communication flows through one route, discriminated by an `intent` field in the request body.

### 1.1 Responsibilities

- **Request validation**: Validates incoming JSON against a Zod schema before processing
- **Intent routing**: Dispatches `explore`, `execute`, and `schema` intents to dedicated handlers
- **Response mapping**: Converts internal `Result<T, E>` types to the `ExternalResponse` shape at the HTTP boundary
- **Middleware application**: CORS, rate limiting, and static file serving
- **Diagnostics**: Emit request routing information via `createDiagnosticsLog` from `utils/diagnostics-log.ts` when `diagnostics` is enabled. See `docs/internals/logging.md` section 7.

### 1.2 Non-Goals

- **Business logic**: The REST layer does not contain domain logic. It delegates to the engine.

## 2. Architecture

The REST module is split into three files to stay under the 400 LOC limit:

| File | Responsibility |
|------|----------------|
| `rest.ts` | Hono app factory, request validation, route registration, middleware runner |
| `intent-handlers.ts` | Explore, execute, schema handlers, `toExternalResponse`, `intentHandlers` lookup |
| `middleware.ts` | `applyRateLimiting`, `applyStaticServing` |

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

### 3.4 Error Handler

All unhandled errors are caught by a global `app.onError` handler:

- **`HTTPException`**: Returns the exception's status code and message in the standard `ExternalResponse` shape. This allows middleware (rate limiter, user middleware) to throw intentional HTTP errors that pass through cleanly.
- **Unknown errors**: Returns a generic `500 Internal Server Error`. The real error message and stack trace are logged via diagnostics but never exposed to the client.

```json
{
  "status": false,
  "message": "Internal server error",
  "data": {}
}
```

### 3.5 Discovery Protection

The `explore` and `schema` intents can be gated via `RestConfig.discovery`:

```typescript
  discovery?: {
    enabled?: boolean;   // default: false, discovery is off unless explicitly enabled
    secret?: string;     // optional, if set, requests must include { payload: { discoverySecret: "..." } }
  }
```

When `discovery.enabled` is `false` (the default), `explore` and `schema` requests return `403`:
```json
{ "status": false, "message": "API discovery is disabled", "data": {} }
```

When `discovery.secret` is set, the request's `payload.discoverySecret` must match. Mismatches return `403`:
```json
{ "status": false, "message": "Invalid or missing discovery secret", "data": {} }
```

#### Visibility Filtering

Actions can declare a `visibility` field:
```typescript
visibility?: { rest?: boolean; rpc?: boolean }
```

If `visibility.rest === false`, the action is hidden from `explore` and `schema` responses. It can still be executed. Visibility only controls discoverability, not access.

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

Runs an action through the engine pipeline. Wildcards are rejected. Both `service` and `action` must be specific.

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
- `Ok(value)`: if value is a plain object, it becomes `data` directly. Arrays and primitives are wrapped as `{ result: value }`.
- `Err(message)`: `status: false`, message is the error string, `data` is empty.

HTTP status codes: `200` for success, `400` for failures and validation errors, `404` for unmatched routes, `500` for unhandled errors (via `app.onError`). `HTTPException` errors pass through with their own status code.

## 6. Middleware

### 6.1 CORS

Applied first via `applyCorsConfig` from `cors/cors.ts`. See `docs/internals/cors.md`.

### 6.2 Rate Limiting

**File:** `rest/middleware.ts`, `applyRateLimiting`

Only applied when `config.rateLimiting.limitingHeader` is set. Uses `hono-rate-limiter`.

- Client key is extracted from the configured request header
- If the header is missing, falls back to IP-based identification: `x-forwarded-for` → `x-real-ip` → `"unknown-client"`
- The fallback is logged via diagnostics so operators can see when the configured header is absent
- Defaults: 100 requests per 15-minute window

### 6.3 Static File Serving

**File:** `rest/middleware.ts`, `applyStaticServing`

Only applied when `config.enableStatic` is `true`. Supports both `"bun"` and `"node"` runtimes.

- Serves files from the configured `staticDir` (default: `"./assets"`) at `/assets/*`
- **Auto-creates the directory** if it doesn't exist (`mkdirSync` with `recursive: true`)
- Dynamically imports the runtime-specific adapter (`hono/bun` for Bun, `@hono/node-server/serve-static` for Node)
- The import result is cached after first successful load
- Import failures are caught by `safeTry`. Static serving is silently skipped

```typescript
rest: {
  enableStatic: true,
  staticDir: "./public",  // optional, defaults to "./assets"
}
```

## 7. Key Types

### 7.1 `RestConfig`

```typescript
{
  baseUrl: string;
  host?: string;
  port?: number;
  diagnostics?: boolean;
  enableStatic?: boolean;
  staticDir?: string;             // default: "./assets", auto-created when enableStatic is true
  enableStatus?: boolean;
  rateLimiting?: RateLimitConfig;
  allowedOrigins: string[];
  cors?: CorsConfig;
  uploads?: UploadsConfig;
  discovery?: DiscoveryConfig;
}
```

### 7.2 `RateLimitConfig`

```typescript
{
  windowMs?: number;          // default: 900000 (15 min)
  limit?: number;             // default: 100
  standardHeaders?: boolean;  // default: true
  limitingHeader: string;     // required, header name for client key
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

### 7.5 `DiscoveryConfig`

```typescript
{
  enabled?: boolean;   // default: false
  secret?: string;     // optional payload secret for explore/schema
}
```

### 7.6 `UploadsConfig`

```typescript
{
  enforceContentType?: boolean;
  limits?: {
    maxFiles?: number;          // default: 10
    maxFileSize?: number;       // default: 10MB
    minFileSize?: number;       // default: 1 byte
    maxTotalSize?: number;      // default: 20MB
    maxFilenameLength?: number; // default: 128
  };
  allow?: {
    mimeTypes?: string[];       // default: ["image/png", "image/jpeg", "application/pdf"]
    extensions?: string[];      // default: [".png", ".jpg", ".jpeg", ".pdf"]
  };
  diagnostics?: boolean;
}
```

7-step sequential validation chain: filename length → zero-byte → min size → file count → max file size → total size → MIME + extension allowlist. Fails fast on first error.

### 7.7 `detectMimeType`

```typescript
import { detectMimeType } from "@nilejs/nile";

const mime = await detectMimeType(file); // "image/png" | null
```

Reads the first 12 bytes of a `Blob` or `File` to detect the actual MIME type from magic byte signatures. Returns `null` if unrecognized. Supported types:

| Signature | MIME type |
|-----------|-----------|
| PNG | `image/png` |
| JPEG | `image/jpeg` |
| GIF (87a/89a) | `image/gif` |
| PDF | `application/pdf` |
| ZIP | `application/zip` |
| WebP | `image/webp` |

This is a standalone utility. It is NOT auto-wired into the validation chain. Call it explicitly in your action handlers when you need to verify a file's actual type beyond the declared `file.type`.

## 8. Constraints

- **Single POST endpoint**: All service interactions go through `POST {baseUrl}/services`. No per-action routes.
- **No streaming**: Responses are JSON only. No SSE or chunked transfer.
- **Rate limiter requires header config**: Without `rateLimiting.limitingHeader` in config, rate limiting is not applied at all. When configured but the header is absent from a request, the limiter falls back to IP-based identification.

## 9. Failure Modes

- **Invalid JSON body**: Returns `400` with "Invalid or missing JSON body"
- **Schema validation failure**: Returns `400` with Zod issue details in `data.errors`
- **Wildcard in execute**: Returns `400` with descriptive message
- **Missing service/action**: Engine returns `Err`, mapped to `400` via `toExternalResponse`
- **Handler crash**: Caught by `safeTry` in the engine pipeline, returned as `Err`
