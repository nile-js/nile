# Per-action CORS

Actions accept `cors?: boolean | CorsOptions`. This controls Nile's CORS handling for the actual response from an `execute` request to the shared services endpoint, including JSON and multipart requests.

| Action setting | Actual execute response |
| --- | --- |
| Omitted or `true` | Inherit the existing endpoint's global and path-specific CORS behavior. |
| `false` | Skip Nile-generated CORS headers and CORS callbacks for this action. |
| A `CorsOptions` object | Merge the object with global defaults and use that policy instead of the endpoint's path-specific policy. |

`rest.cors.enabled: false` is a global hard off. An action cannot re-enable CORS while it is set.

## Action definitions

Add the setting to the action definition inside a service:

```ts
import type { Action } from "@nilejs/nile";
import { Ok } from "@nilejs/nile/fp";

const actions: Action[] = [
  {
    name: "summary",
    description: "Read the report summary using inherited CORS",
    handler: () => Ok({ total: 42 }),
  },
  {
    name: "internalSummary",
    description: "Read the summary without Nile CORS processing",
    cors: false,
    handler: () => Ok({ total: 42 }),
  },
  {
    name: "partnerSummary",
    description: "Allow the partner origin to read the summary",
    cors: {
      origin: "https://partner.example",
      credentials: false,
      exposeHeaders: ["X-Report-Version"],
    },
    handler: () => Ok({ total: 42 }),
  },
];
```

An action object overrides only the fields it provides. Other fields come from the global defaults built from `rest.allowedOrigins` and `rest.cors.defaults`. It does not inherit an `addCors` path rule. For example, `{ credentials: false }` keeps the global origin policy while disabling the credentials response header.

## Shared preflight and discovery

All actions use the same `POST {baseUrl}/services` endpoint. A browser's `OPTIONS` preflight does not carry the execute body, so Nile cannot select an action policy for it. Preflight continues to use the endpoint's global/path CORS configuration.

**Configure the endpoint's preflight policy to allow every origin, method and request header needed by action overrides.** An action override that permits `https://partner.example` cannot make a browser request succeed if the shared preflight rejects that origin first.

Set preflight-specific `allowMethods`, `allowHeaders` and `maxAge` through the global/path configuration. Providing those fields in an action's `CorsOptions` does not change the shared `OPTIONS` policy. The actual action response uses the applicable origin, credentials and exposed-header settings.

`explore` and `schema` discovery requests also keep the global/path policy, even when they name an action with `cors: false` or an override. Other routes retain their existing CORS behavior.

## Errors and middleware

Nile selects the action policy after recognizing valid execute routing and before payload or upload validation. The selected policy therefore also applies to validation and upload-error responses for that action.

Requests that cannot identify an execute action use the inherited endpoint policy. This includes malformed JSON, invalid routing, missing actions and middleware responses produced before action selection.

`cors: false` skips Nile's CORS work; it does not reject execution. CORS controls browser access to responses and is not authorization. Continue using the action's normal authentication and access checks.

## Compilation and dynamic policies

Nile compiles static action policies when the REST application is created. Change static definitions before creating the application; recreate it to apply later policy changes.

Dynamic origin callbacks and inherited path resolvers still run for each applicable request with its current HTTP context. They do not run for an action with `cors: false`, or when global CORS is disabled. Policy selection belongs to the individual request, so overlapping actions cannot overwrite each other's selected policy.

Nile prepares selected headers after routing and before action execution, then appends `Vary` as the response unwinds. Action handlers can still override prepared headers. Middleware that runs before routing cannot inspect action-specific CORS headers yet.
