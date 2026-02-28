# CORS Middleware

**Type:** Reference / Specification
**Path:** `cors/`

## 1. Purpose

The CORS module configures Cross-Origin Resource Sharing middleware on the Hono app. It supports global defaults derived from `RestConfig.allowedOrigins`, per-route static overrides, and dynamic resolver functions for runtime origin decisions.

### 1.1 Responsibilities

- **Default CORS derivation** — Build sensible defaults from `RestConfig.allowedOrigins`
- **Global middleware** — Apply a catch-all CORS handler to all routes
- **Route-specific rules** — Apply per-path overrides or resolver-based CORS before the global handler
- **Security boundary** — Deny access (empty origin) when resolvers throw errors

### 1.2 Non-Goals

- **Authentication** — CORS is a browser security mechanism, not an auth layer
- **Request blocking** — CORS headers influence browser behavior but do not block server-side requests

## 2. Architecture

| File | LOC | Responsibility |
|------|-----|----------------|
| `cors.ts` | 140 | `buildDefaultCorsOptions`, `applyCorsConfig`, route rule application, resolver evaluation |
| `types.ts` | 94 | `CorsOptions`, `CorsResolver`, `CorsRouteRule`, `CorsConfig` |

`applyCorsConfig` accepts `RestConfig` directly (not `ServerConfig`).

## 3. Configuration Flow

### 3.1 Enabled States

`CorsConfig.enabled` controls whether CORS middleware is applied:

- `true` or `"default"` (default) — CORS middleware is active
- `false` — No CORS middleware is applied, no CORS headers are set

### 3.2 Default Options

`buildDefaultCorsOptions` derives defaults from `RestConfig`:

```typescript
{
  origin: config.cors?.defaults?.origin ?? getDefaultOrigin,
  credentials: true,
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["POST", "GET", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600
}
```

Origin resolution when no `cors.defaults.origin` is specified:
- If `allowedOrigins` has entries — request origin is checked against the list, rejected origins get `""`
- If `allowedOrigins` is empty — returns `"*"` (allow all)

All defaults can be overridden via `cors.defaults`.

### 3.3 Application Order

1. **Route-specific rules** (`cors.addCors[]`) are applied first as path-scoped middleware
2. **Global CORS** (`app.use("*", cors(...))`) is applied last as a catch-all

This order matters in Hono: route-specific middleware runs before global middleware for matching paths.

## 4. Route Rules (`CorsRouteRule`)

Each rule targets a specific path and can use either static options or a dynamic resolver:

```typescript
{
  path: "/api/public/*",
  options: { origin: "*", credentials: false }
}
```

Or with a resolver:

```typescript
{
  path: "/api/partners/*",
  resolver: (origin, c) => {
    if (partnerOrigins.includes(origin)) return true;
    return false;
  }
}
```

If both `options` and `resolver` are present, `resolver` takes precedence.

## 5. Resolver Behavior

A `CorsResolver` function receives the request origin and Hono context, and returns:

| Return value | Behavior |
|-------------|----------|
| `true` | Allow origin with default options |
| `false` | Deny (origin set to `""`) |
| `CorsOptions` object | Merge with defaults and use |
| `undefined` | Use default options |
| **throws** | **Deny** (origin set to `""`) |

The deny-on-error behavior is a security decision: resolver failures never fall through to allow.

## 6. Key Types

### 6.1 `CorsConfig`

```typescript
{
  enabled?: boolean | "default";
  defaults?: CorsOptions;
  addCors?: CorsRouteRule[];
}
```

### 6.2 `CorsOptions`

```typescript
{
  origin?: string | string[] | ((origin: string, c: Context) => string | undefined | null);
  allowMethods?: string[] | ((origin: string, c: Context) => string[]);
  allowHeaders?: string[];
  maxAge?: number;
  credentials?: boolean;
  exposeHeaders?: string[];
}
```

Compatible with Hono's `cors()` middleware parameter shape.

### 6.3 `CorsResolver`

```typescript
type CorsResolver = (origin: string, c: Context) => boolean | CorsOptions | undefined;
```

### 6.4 `CorsRouteRule`

```typescript
{
  path: string;
  options?: CorsOptions;
  resolver?: CorsResolver;
}
```

## 7. Constraints

- **Hono middleware ordering** — The global `app.use("*", cors(...))` also fires on routes that have route-specific rules. In practice this means the global handler may overwrite route-specific headers. This is known Hono behavior.
- **No preflight caching per-route** — `maxAge` is set globally. Route-specific `maxAge` overrides are applied but browser caching behavior may vary.

## 8. Failure Modes

- **Resolver throws** — Caught, logged to `console.error`, origin set to `""` (deny)
- **Empty `allowedOrigins` with no `cors.defaults.origin`** — Falls through to `"*"` (allow all). This is intentional for development convenience but should be restricted in production.
- **`enabled: false`** — No CORS middleware is applied. Browsers will block cross-origin requests entirely.
