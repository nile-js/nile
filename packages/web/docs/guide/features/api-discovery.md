---
title: "API discovery and schemas"
description: "Let trusted tools list services and read action input schemas through the explore and schema intents"
---

Discovery answers two questions for tools and agents: which services and actions exist, and what input each action expects. It uses the same `POST /api/services` endpoint as ordinary calls, with the `explore` and `schema` intents. It is off unless you enable it.

## When to use it

Use discovery when an integration, a code generator or an AI agent needs the current action list and their input shapes. Keep it away from browsers and public clients. Discovery describes actions; it does not authorize calling them.

## Complete example

This server enables discovery with a secret. The helper function runs on a trusted server and asks for one action's schema. `config.discoverySecret` comes from your configuration module.

```ts
import { createNileServer, createServices } from "@nilejs/nile";
import { Err, Ok, safeTry, type Result } from "slang-ts";

export const services = createServices([
  {
    name: "projects",
    description: "Project operations",
    actions: [],
  },
]);

export const server = await createNileServer({
  serverName: "team-workspace",
  services: services,
  rest: {
    baseUrl: "/api",
    allowedOrigins: ["https://app.example.com"],
    discovery: {
      enabled: true,
      secret: config.discoverySecret,
      cacheSchemas: true,
    },
  },
});

type DiscoveryDocument = {
  status: boolean;
  message: string;
  data: Record<string, unknown>;
};

/** Runs on a trusted integration server, never in a browser bundle. */
export const fetchActionSchema = async (
  service: string,
  action: string
): Promise<Result<DiscoveryDocument, string>> => {
  const response = await safeTry(() =>
    fetch("https://api.example.com/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "schema",
        service: service,
        action: action,
        payload: { discoverySecret: config.discoverySecret },
      }),
    })
  );

  if (response.isErr) {
    return Err("Discovery request failed");
  }

  const document = (await response.value.json()) as DiscoveryDocument;
  if (!document.status) {
    return Err(document.message);
  }

  return Ok(document);
};
```

Requests to `explore` and `schema` must include `discoverySecret` in the payload. A header or a JWT does not satisfy the gate.

Without the secret, the server refuses the request:

```json
{
  "status": false,
  "message": "Invalid or missing discovery secret",
  "data": {}
}
```

With the secret, `explore` lists services and their action names. A `schema` request for one action returns its JSON Schema under the action name. An action without validation returns `null`:

```json
{
  "status": true,
  "message": "Schema for 'account.ping'",
  "data": { "ping": null }
}
```

## Intents and wildcards

| Intent | Service | Action | Returns |
| --- | --- | --- | --- |
| `explore` | `"*"` | `"*"` | Every service with its action names. |
| `explore` | `"name"` | `"*"` | Action summaries for one service. |
| `explore` | `"name"` | `"name"` | Details for one action. |
| `schema` | `"name"` | `"name"` | JSON Schema for one action, keyed by the action name. |
| `schema` | `"*"` or `"name"` | `"*"` | Schemas for several actions. |

## Options that matter

| Option | Effect |
| --- | --- |
| `rest.discovery.enabled` | Turns discovery on. Off by default. |
| `rest.discovery.secret` | Value that must appear as `payload.discoverySecret`. If it is unset, the gate does not check a secret, so set one. |
| `rest.discovery.cacheSchemas` | Caches JSON Schema conversions. On by default. |
| Action `cacheSchema` | Set `false` to convert that action's schema on every request. |
| Action `visibility.rest` | Set `false` to leave the action out of detailed schema output. |

## How it behaves

- Schemas are converted only when a schema request needs them. Ordinary calls never convert them.
- The JSON Schema describes the Zod input. Refinements, transforms and defaults may become looser descriptions, so the server still validates every call.
- Replacing an action's `validation` schema object refreshes its cached conversion. Changing fields on the same object can leave the cache stale.
- Discovery does not run JWT checks or role hooks. Anyone with the secret can read the descriptions.

## Limits

- The stock `@nilejs/client` `explore` and `schema` methods send an empty payload, so they cannot pass the secret. Use a plain `fetch` on a trusted server, as in the example.
- Discovery is not a permission system. Keep the secret out of browser bundles and public repositories.
- `visibility.rest: false` hides an action's detail, but the service list can still show its name.

## Common mistakes

- Enabling discovery without a secret in production. Without a secret, the gate does not check anything.
- Putting the discovery secret in a frontend bundle.
- Assuming schema output is filtered to the caller's role.
- Treating a tool description as permission to call an action. Call actions through your normal authentication.

## See also

- [Discovery and agents](/guide/basics/discovery-and-agents) explains how to connect a tool to discovery.
- [Build with AI agents](/guide/agents) describes the agent workflow and the Nile Js skill.
- [Authentication and hooks](/guide/features/authentication-and-hooks) covers the checks that still apply to a call.
