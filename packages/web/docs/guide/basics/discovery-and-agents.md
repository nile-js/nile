# Let tools inspect the operations you expose

A predictable domain structure helps a coding agent find implementation files. Runtime discovery solves a different problem: an integration can inspect registered operations and their input descriptions before calling them.

Nile provides `explore` and `schema` intents. It does not include an MCP server, an autonomous agent runtime or automatic tool registration. Your integration decides which operations a tool can call and carries the caller's credentials.

## Enable discovery deliberately

Discovery is **disabled by default**. This server-config fragment enables it with a secret supplied by your application's configuration module:

```typescript
rest: {
  baseUrl: "/api",
  allowedOrigins: ["https://app.example.com"],
  discovery: {
    enabled: true,
    secret: config.discoverySecret,
    cacheSchemas: true,
  },
}
```

The current CLI template explicitly enables discovery for development. Review that setting before deployment.

Discovery checks `payload.discoverySecret`; a request header or JWT alone does not satisfy that gate. The secret grants metadata access, not permission to execute a protected business action. Discovery does not run each action's JWT or authorization hooks. Do not expose sensitive descriptions or assume discovery results are filtered to the current user's role.

## Inspect and invoke through an integration

This ordinary Fetch request works with secret-protected discovery. Keep the discovery secret on a trusted integration server rather than in a public browser bundle.

```typescript
const response = await fetch("https://api.example.com/api/services", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    intent: "schema",
    service: "projects",
    action: "create",
    payload: { discoverySecret: config.discoverySecret },
  }),
});
const document = await response.json();
```

Check both the HTTP response and `document.status` before using `document.data.create` as the input description. Use `safeTry` around the Fetch/JSON operation in a production bridge, as with other external calls. The stock client's `schema` and `explore` methods send an empty payload, so they cannot currently pass this secret.

An `explore` request with `service: "*", action: "*"` lists services. Use a specific service and `action: "*"` for its action summaries, or specify both for details. A `schema` request with both names returns `{ [actionName]: jsonSchema }` in `data`; wildcards request broader schema maps.

After inspection, an allowed tool invokes the usual business operation:

```json
{
  "intent": "execute",
  "service": "projects",
  "action": "create",
  "payload": { "name": "Customer portal" }
}
```

The request still needs the application's normal credentials and policies. Keep a tool allowlist, confirm consequential operations in your integration, and let Nile validate the input before the main handler. Do not let tool descriptions stand in for authorization.

## Schema conversion is lazy

The original Zod schema validates execution input. Its JSON Schema description is converted only when a schema request needs it, then cached by default. Ordinary action execution does not require converting discovery schemas.

- Set `rest.discovery.cacheSchemas: false` to disable the adapter's conversion cache globally.
- Set `cacheSchema: false` on an action to keep its conversion dynamic.
- Replacing `action.validation` with a new schema root refreshes conversion. Mutating metadata on the same schema object can leave a cached description stale; replace the root or opt out.

JSON Schema cannot express every Zod refinement, transform or runtime default. Unrepresentable parts may become permissive descriptions, and conversion failure or an action without validation can produce `null`. Always retain server-side validation.

`visibility: { rest: false }` omits an action from detailed discovery/schema output. The top-level service listing can still name registered actions, and visibility is not an execution permission boundary. Enforce real access rules in [authentication and authorization](/guide/basics/auth).
