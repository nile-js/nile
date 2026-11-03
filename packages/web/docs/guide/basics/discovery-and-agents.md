---
title: "Discovery and agents"
description: "Expose selected action schemas for tools and coding agents"
---

Enable discovery so trusted tools can list registered services and inspect action schemas before calling them.

Nile provides the `explore` and `schema` intents. Connecting them to an agent, such as an MCP server or a tool registry, is your integration's job: it decides which operations a tool can call and carries the caller's credentials.

## Enable discovery deliberately

Discovery is **disabled by default**. This server-config fragment enables it with a secret supplied by your application's configuration module:

```ts
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

The CLI template enables discovery for development. Review the setting before deployment.

Discovery checks `payload.discoverySecret` only; a header or JWT is ignored. The secret lets a tool read action metadata, not call protected actions. Discovery skips each action's JWT check and hooks, so every caller with the secret sees the same results. Keep sensitive details out of action descriptions.

## Inspect and invoke through an integration

This Fetch request reads secret-protected discovery. Keep the discovery secret on a trusted integration server, out of browser bundles.

```ts
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

Check both the HTTP response and `document.status` before using `document.data.create` as the input description. In production, wrap the Fetch and JSON parsing in `safeTry`, as with other external calls. The client's `schema` and `explore` methods send an empty payload, so they cannot pass the secret.

An `explore` request with `service: "*", action: "*"` lists services. Use a specific service and `action: "*"` for its action summaries, or specify both for details. A `schema` request with both names returns `{ [actionName]: jsonSchema }` in `data`; wildcards request broader schema maps.

After inspection, an allowed tool calls the action as usual:

```json
{
  "intent": "execute",
  "service": "projects",
  "action": "create",
  "payload": { "name": "Customer portal" }
}
```

The request still needs the application's normal credentials and policies. Keep a list of the tools you allow, confirm operations with real consequences in your integration, and let Nile validate the input before the handler. Authorization comes from your policies, never from a tool description.

## Schemas are converted on request

The Zod schema validates input when the action runs. Its JSON Schema description is built the first time a schema request asks for it, then cached by default, so calling actions never pays for the conversion.

- Set `rest.discovery.cacheSchemas: false` to turn off the conversion cache for every action.
- Set `cacheSchema: false` on an action to keep its conversion dynamic.
- The cache is keyed by schema object. Assigning a new schema to `action.validation` refreshes the description; changing metadata on the same schema object keeps the cached one, so assign a new schema or turn off caching.

JSON Schema cannot express every Zod refinement, transform or runtime default. Those parts come out looser than the Zod schema, and an action without validation, or one whose conversion fails, returns `null`. The server always validates with the Zod schema itself.

`visibility: { rest: false }` leaves an action out of action summaries and schema output, though the top-level service listing still includes its name. HTTP calls to the action still run, so enforce access with [authentication and authorization](/guide/basics/auth).
