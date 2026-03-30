# Nile Framework — QA + Security Review Report

**Package:** `@nilejs/nile@0.0.7`
**Date:** 2026-03-30
**Scope:** Full package at `packages/nile/`
**Reviewers:** Senior QA Engineer, Senior Security & Reliability Engineer

---

## Executive Summary

Two independent reviews were conducted in parallel — a QA pass covering test coverage, type safety, code quality, API consistency, and edge cases; and a security audit covering authentication, session management, input validation, middleware, error handling, rate limiting, CORS, and dependencies.

**Both reviews independently flagged the same critical architectural issue:** the singleton `NileContext` carrying mutable per-request state creates a race condition under concurrent load that cross-contaminates authentication data between requests.

**Overall Posture:** Needs remediation before production. The functional architecture, Result pattern, Zod validation, and `safeTry` wrapping provide a strong foundation — but the singleton context model and several missing safeguards must be addressed.

---

## Test Run Results

**Command:** `bun test` in `packages/nile/`
**Result:** 281 pass / 11 fail across 292 tests in 16 test files

### Failing Tests Breakdown

| Test File | Failures | Root Cause |
|-----------|----------|------------|
| `logging/logger.test.ts` | 8 | Missing `MODE` env var in test setup — tests not self-contained |
| `utils/tests/handle-error.test.ts` | 1 | Hard-codes `"unknown"` for stack-trace-derived caller name — runtime-dependent |
| `rest/tests/rest-uploads.test.ts` | 1 | Zero-byte file crashes `validateFilenameLength` — real bug |
| `rest/uploads/tests/validate-files.test.ts` | 1 | Bun appends `;charset=utf-8` to text MIME types — exact-match fails |

---

## Critical Findings

### 1. 🔴 CRITICAL — Singleton NileContext Session Race Condition

**Files:** `rest/rest.ts:219`, `nile/nile.ts:26-49`, `engine/engine.ts:58`
**Flagged by:** Both QA and Security independently

The `NileContext` is a singleton created once in `server.ts:56` and shared across all concurrent requests. Two mutable fields are written per-request with no isolation:

1. `nileContext.rest = c` at `rest/rest.ts:219` — overwrites the Hono context pointer on every request
2. `nileContext.setSession("rest", {...})` at `engine/engine.ts:58` — overwrites the singleton's session object

Under concurrent load:

- Request A hits the POST handler, sets `nileContext.rest = contextA`
- Request B hits the POST handler before A finishes, sets `nileContext.rest = contextB`
- Request A's pipeline now reads `contextB`'s Hono context (wrong cookies, wrong headers)
- Request A's auth verification writes User B's identity to the shared session
- Request A's action handler reads User B's session data

The `resetHookContext` at `engine.ts:183` only resets `hookContext` — it does NOT reset `sessions`. There is zero session cleanup between requests.

```typescript
// nile.ts:83 — only resets hookContext, NOT sessions
resetHookContext(actionName: string, input: unknown) {
  context.hookContext = {
    actionName,
    input,
    state: {},
    log: { before: [], after: [] },
  };
  // sessions NOT touched
},
```

**Impact:**

- User A can execute actions as User B
- Complete authentication bypass under concurrent load
- Data confidentiality breach (reading another user's data)
- Privilege escalation (admin session leaks to unprivileged user)
- This is not theoretical — it will happen in production with even moderate traffic

**Recommended Fix:**

Use per-request context scoping. Options:

- **Option A:** Use Hono's built-in per-request context (`c.set()` / `c.get()`) for session data
- **Option B:** Create a new per-request context object for each request
- **Option C:** Use `AsyncLocalStorage` to scope context per-request
- **Option D:** Pass the Hono context as a parameter down the pipeline instead of mutating the singleton

---

### 2. 🔴 CRITICAL — Shared `_store` Map Across All Requests

**File:** `nile/nile.ts:22,34,37,41`

The `Map<string, unknown>` store (`_store`) is created once and shared across all requests. Any action handler calling `nileContext.set("someKey", value)` will persist that value across all subsequent requests from all users.

```typescript
// nile.ts:22 — single Map for ALL requests
const store = new Map<string, unknown>();
```

**Impact:**

- Action handlers storing per-request data (user preferences, temporary tokens, intermediate results) will leak between requests
- Any developer writing `nileContext.set("currentUser", user)` in a handler creates a cross-request leak

**Recommended Fix:** Same as finding #1 — the store must be request-scoped, not singleton-scoped.

---

### 3. 🔴 CRITICAL — `validateFilenameLength` Crashes on Zero-Byte Files

**Files:** `rest/uploads/validate-files.ts:29`, `rest/tests/rest-uploads.test.ts:292-305`

Bun's `Hono parseBody({ all: true })` returns `File` objects with `name: undefined` when the file is zero bytes. The `validateFilenameLength` function calls `file.name.length` with no null guard, causing a `TypeError: undefined is not an object`.

This crashes the validator before it can reach `validateZeroByteFiles`, causing a raw 500 error.

**Two problems:**

1. Source bug: `validateFilenameLength` lacks a `file.name` null guard
2. Bun-specific: Zero-byte File objects from Hono's parser lose their name property

**Impact:** Any zero-byte file upload crashes the entire request with an unstructured 500 error.

**Recommended Fix:**

```typescript
// Add null guard
if (!file.name) {
  return { valid: false, reason: "File has no name" };
}
```

---

## High Findings

### 4. 🟠 HIGH — No Global Hono Error Handler

**File:** `rest/rest.ts` (entire file)

The Hono app has no `app.onError` handler registered. If an unhandled exception occurs anywhere in the middleware chain or route handlers, Hono's default error handler returns a 500 with the full error message and potentially stack traces.

**Impact:**

- Stack traces, file paths, and internal error messages leak to clients
- Internal architecture details exposed (module paths, function names)
- Assists attackers in mapping the application structure

**Recommended Fix:**

```typescript
app.onError((err, c) => {
  // Log full error internally
  log(`Unhandled error: ${err.message}`, err.stack);
  // Return safe response
  return c.json(
    { status: false, message: "Internal server error", data: {} },
    500
  );
});
```

---

### 5. 🟠 HIGH — Rate Limiting Bypass via Missing Header

**File:** `rest/middleware.ts:33-39`

When the configured `limitingHeader` is missing from a request, the rate limiter falls back to a shared key `"__unknown_client__"`:

```typescript
keyGenerator: (c) => {
  const key = c.req.header(rateLimiting.limitingHeader);
  if (!key) {
    return UNKNOWN_CLIENT_KEY; // "__unknown_client__"
  }
  return key;
},
```

**Impact:**

- An attacker can omit the limiting header entirely and share a single large bucket with all other header-less requests
- If the shared bucket fills up, all requests without the header are blocked — including legitimate unauthenticated requests
- Rate limiting is effectively optional from the client's perspective

**Recommended Fix:**

Fall back to IP-based limiting:

```typescript
keyGenerator: (c) => {
  const key = c.req.header(rateLimiting.limitingHeader);
  if (!key) {
    return c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';
  }
  return key;
},
```

---

### 6. 🟠 HIGH — No Cookie Security Attributes for Cookie-Based Auth

**File:** `auth/jwt-handler.ts:48-55`, `auth/types.ts`

The framework supports cookie-based JWT authentication (`method: "cookie"`), but there is no configuration or enforcement of cookie security attributes. The `AuthConfig` interface has no options for `httpOnly`, `secure`, `sameSite`, or cookie path/domain restrictions.

**Impact:**

- If a consumer sets their auth cookie without `httpOnly`, XSS can steal JWT tokens
- Without `secure`, cookies transmit over HTTP in plaintext
- Without `sameSite`, CSRF attacks become possible

**Recommended Fix:**

Add cookie security options to `AuthConfig` and document requirements prominently. Consider adding a `setCookie` helper that enforces secure defaults.

---

### 7. 🟠 HIGH — JWT Algorithm Hardcoded to HS256

**File:** `auth/jwt-handler.ts:100`

The algorithm is hardcoded to `"HS256"` with no configuration option:

```typescript
const claims = await verify(token, config.secret, "HS256");
```

Additionally, there is no minimum length validation on `config.secret`.

**Impact:**

- Forces all deployments to use symmetric JWT signing
- In microservices architectures, the same secret must be shared everywhere — increasing the attack surface
- No protection against weak secrets (e.g., `secret: "secret"`)

**Recommended Fix:**

```typescript
export interface AuthConfig {
  secret: string;
  algorithm?: 'HS256' | 'RS256' | 'ES256'; // default: 'HS256'
}

// Validate secret length
if (config.secret.length < 32) {
  return Err("JWT secret must be at least 32 characters");
}
```

---

### 8. 🟠 HIGH — `addMiddleware` Has Zero Test Coverage

**Files:** `rest/rest.ts:303`, `nile/server.ts:109`

`addMiddleware` is a newly added feature that is defined, typed, wired into the server, and even returned in test helpers — but never actually tested. No test verifies:

- Middleware is called before the POST handler
- Multiple middleware entries chain in order
- Path-prefix filtering works
- Middleware calling `next()` passes control correctly
- Middleware not calling `next()` short-circuits the response

---

### 9. 🟠 HIGH — 8 Logger Tests Failing Due to Missing Environment Setup

**File:** `logging/logger.test.ts:50, 76, 173, 203, 238, 264, 297, 302`

5 tests crash with `throw new Error("Missing MODE environment variable")` — the logger requires `process.env.MODE` but the test suite doesn't set it. 2 additional `getLogs` tests are cascade failures.

The tests are not self-contained. They should either mock the env var in `beforeEach` or the logger should accept mode as a parameter.

---

## Medium Findings

### 10. 🟡 MEDIUM — MIME Type Exact-Match Fails with Bun's Charset Suffix

**Files:** `rest/uploads/validate-files.ts:155`, `rest/uploads/tests/validate-files.test.ts:272`

Bun's `File` constructor normalizes text MIME types by appending `;charset=utf-8`. The `validateAllowlist` function uses `allowedMimes.includes(file.type)` — an exact string match. Any allowlist entry of `"text/plain"` will fail to match `"text/plain;charset=utf-8"` in Bun.

**Recommended Fix:** Use `startsWith` or normalize MIME types by stripping parameters before comparison.

---

### 11. 🟡 MEDIUM — Path Traversal in Logger `appName`

**File:** `logging/logger.ts:57,60`

The `appName` parameter is used directly in `path.join()` without sanitization. If `appName = "../../etc"`, this could write logs to arbitrary filesystem locations.

**Recommended Fix:** Strip path separators and dots from `appName`.

---

### 12. 🟡 MEDIUM — No Middleware Timeout, Depth Limit, or Error Isolation

**File:** `rest/rest.ts:192-212`

The dynamic middleware registry has no safeguards:

- No timeout — a middleware that never calls `next()` blocks the request forever
- No depth limit — unlimited middleware registrations could exhaust the call stack
- No error isolation — a throwing middleware crashes the entire request
- A middleware can call `next()` multiple times, potentially re-executing the downstream chain

**Recommended Fix:** Add timeout wrapping, maximum middleware count, and error isolation.

---

### 13. 🟡 MEDIUM — CORS Wildcard Origin with Credentials Enabled by Default

**File:** `cors/cors.ts:12-15,19`

When `allowedOrigins` is empty, CORS origin defaults to `"*"`, combined with `credentials: true` by default. While browsers reject this combination per spec, the default configuration is overly permissive.

**Recommended Fix:** Default to denying when no origins are configured.

---

### 14. 🟡 MEDIUM — Explore/Schema Intents Expose API Structure Without Auth

**File:** `rest/intent-handlers.ts`

The `explore` and `schema` intents bypass authentication entirely. Any unauthenticated request can enumerate all services, actions, protection levels, access control roles, hook configurations, and full Zod-to-JSON schemas.

**Recommended Fix:** Add optional auth gating via `protectDiscovery?: boolean` on `RestConfig`.

---

### 15. 🟡 MEDIUM — `onBoot` Fire-and-Forget Swallows Critical Errors

**File:** `nile/server.ts:127-134`

The boot lifecycle hook is intentionally not awaited. If `onBoot` performs critical initialization (database migrations, cache warming, key loading), a failure is only logged to console — the server continues to serve requests in a potentially broken state.

**Recommended Fix:** Provide a `critical` flag on `onBoot` — when true, server fails to start on error.

---

### 16. 🟡 MEDIUM — `console.log`/`console.error` Bypass Configured Logger

**File:** `nile/server.ts:116-130`

Server startup messages and `onBoot` error logging use raw `console.log`/`console.error` instead of the configured logger. The pattern elsewhere (`createDiagnosticsLog`) respects `resources.logger`.

---

### 17. 🟡 MEDIUM — No Test for `nileContext.rest` Population During Real REST Request

The key feature "populate `nileContext.rest` with per-request Hono context" is tested only indirectly through auth integration tests that manually set the context. No test verifies that after a real `app.request()` call, `nileContext.rest` holds the live Hono context.

---

## Low Findings

### 18. 🟢 LOW — `handleError` Test Hardcodes Runtime-Dependent Value

**File:** `utils/tests/handle-error.test.ts:41`

Test expects `atFunction: "unknown"` but Bun resolves to `"<anonymous>"` from stack trace introspection. Runtime-dependent assertion.

---

### 19. 🟢 LOW — `AuthContext` Still Exported from `auth/index.ts` Barrel

**File:** `auth/index.ts:4`

`AuthContext` was removed from the main public `index.ts` but is still exported from the auth sub-barrel. If consumers can `import { AuthContext } from "@nilejs/nile/auth"`, it's still technically exposed.

---

### 20. 🟢 LOW — `safeTrySync` Local Reimplementation

**File:** `rest/intent-handlers.ts:213`

A local `safeTrySync` utility returns a non-standard `{ err, result }` shape inconsistent with the project's Result pattern from `slang-ts`.

---

### 21. 🟢 LOW — Files Exceeding 400 LOC Limit

| File | Lines |
|------|-------|
| `utils/db/create-model.ts` | 411 |
| `logging/logger.ts` | 409 |

Both are 1–11 lines over the `AGENTS.md` limit. Minor.

---

### 22. 🟢 LOW — `process.env` Direct Access in Logger

**File:** `logging/logger.ts:29,32,169,172`

Logger accesses `process.env.MODE` and `process.env.NODE_ENV` directly instead of through the config module, violating project coding standards.

---

### 23. 🟢 LOW — Module-Level Singleton Prevents Multi-Instance

**File:** `nile/server.ts:9,60`

`let _nileContext: NileContext | null = null` is a module-level mutable singleton. Calling `createNileServer` twice silently overwrites it. No multi-instance support.

---

### 24. 🟢 LOW — Pipeline Log Mode Exposes Full Hook I/O

**File:** `engine/engine.ts:274-276`

When `action.result?.pipeline` is truthy, the response includes the entire hook execution log with raw inputs and outputs. If enabled in production, leaks internal data transformation details.

---

### 25. 🟢 LOW — MIME Type Validation Trusts Client-Provided Content-Type

**File:** `rest/uploads/validate-files.ts:150-176`

File validation checks `file.type` (client-supplied MIME type) and `file.name` (client-supplied filename). Neither are trustworthy — an attacker can upload a `.exe` with `type: "image/png"`.

---

## Informational

### 26. ℹ️ INFO — No JSON Body Size Limit

**File:** `rest/rest.ts:236`

JSON body is parsed with `c.req.json()` without explicit size limits. While Hono/runtime may impose defaults, there's no framework-level limit.

---

### 27. ℹ️ INFO — Dependencies Are Current

`package.json` dependencies are current. Hono `^4.11.9`, Zod `^4.3.6`, and `nanoid@^5.1.6` have no known critical CVEs.

---

### 28. ℹ️ INFO — No `eval()` or Dynamic Code Execution

Zero results for `eval(`, `new Function(`, or dynamic `import()` with user input. The dynamic `import(adapterModule)` in `middleware.ts:93` uses hardcoded module paths — safe.

---

### 29. ℹ️ INFO — No Prototype Pollution Vectors

No use of `Object.assign()` with request data, no `__proto__` access, no bracket-notation property assignment from user input. Zod's `safeParse` creates clean objects.

---

## Strengths

- Clean functional architecture with no classes/OOP — reduces attack surface
- Zod validation is properly applied before handler execution in the pipeline
- `safeTry` wrapping prevents unhandled promise rejections in the engine pipeline
- JWT verification delegates to battle-tested `hono/jwt` which auto-validates `exp`/`nbf`/`iat`
- Upload validation chain is thorough (7-step fail-fast)
- CORS resolver errors correctly deny access (deny-on-failure)
- Error handling via Result pattern prevents most crash scenarios
- No `eval()`, prototype pollution, or injection vectors
- Dependencies current, no known CVEs

---

## Priority Remediation Order

| Priority | Findings | Description |
|----------|----------|-------------|
| **P0 — Immediate** | #1, #2 | Fix singleton context race condition — per-request scoping for `rest`, sessions, and `_store` |
| **P0 — Immediate** | #3 | Fix `validateFilenameLength` null guard for zero-byte files |
| **P1 — Before Production** | #4 | Add global `app.onError` handler |
| **P1 — Before Production** | #5 | Fix rate limiting bypass (IP-based fallback) |
| **P1 — Before Production** | #6, #7 | Cookie security attributes and JWT algorithm flexibility |
| **P1 — Before Production** | #8, #9 | Test coverage for `addMiddleware` and fix logger test env setup |
| **P2 — Soon After** | #10–#17 | MIME normalization, path traversal, middleware safeguards, CORS defaults, discovery auth gating, onBoot critical flag, console.log cleanup, nileContext.rest test |
| **P3 — Maintenance** | #18–#25 | Minor test fixes, internal barrel cleanup, LOC limits, process.env patterns, pipeline log exposure |
| **P4 — Informational** | #26–#29 | Body size limits, dependency monitoring |
