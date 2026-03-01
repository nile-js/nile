# Static File Serving

Nile can serve static files from a local directory through the REST interface. This is useful for serving images, documents, or any assets your application needs to expose over HTTP.

## Configuration

Enable static file serving with `enableStatic` and specify your server runtime:

```typescript
const server = createNileServer({
  name: "MyApp",
  runtime: "bun", // or "node"
  services: [/* ... */],
  rest: {
    baseUrl: "/api/v1",
    allowedOrigins: ["http://localhost:3000"],
    enableStatic: true,
  },
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableStatic` | `boolean` | `false` | Enable static file serving at `/assets/*` |
| `runtime` | `"bun" \| "node"` | `"bun"` | Server runtime — determines which adapter is used |

## How It Works

When `enableStatic` is `true`, Nile registers a middleware on `/assets/*` that serves files from a `./assets` directory relative to your project root.

```
your-project/
├── assets/
│   ├── logo.png
│   ├── styles.css
│   └── docs/
│       └── readme.pdf
├── src/
│   └── index.ts
└── package.json
```

These files are then accessible at:

```
GET /assets/logo.png
GET /assets/styles.css
GET /assets/docs/readme.pdf
```

## Cross-Runtime Support

Nile dynamically imports the correct `serveStatic` adapter based on the `runtime` value:

| Runtime | Adapter |
|---------|---------|
| `bun` | `hono/bun` |
| `node` | `@hono/node-server/serve-static` |

The adapter is **lazy-loaded** on the first request to `/assets/*`, not at startup. This avoids runtime-specific import issues during testing or mixed environments.

If the adapter fails to load (e.g., the package isn't installed), static serving is silently disabled and requests to `/assets/*` fall through to the 404 handler.

### Node Requirement

When using `runtime: "node"`, make sure the Node adapter is installed:

```bash
bun add @hono/node-server
```

The Bun adapter ships with Hono by default, so no extra install is needed for Bun.

## Middleware Order

Static file serving runs after CORS and rate limiting, but before the main service endpoint:

1. CORS
2. Rate limiting
3. **Static file serving** (`/assets/*`)
4. `POST {baseUrl}/services` (RPC endpoint)
5. `GET /status` (health check)
6. 404 handler

This means static file requests respect your CORS and rate limiting configuration.
