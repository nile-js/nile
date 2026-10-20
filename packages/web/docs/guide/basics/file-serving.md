# Serve public assets when needed

For a small application, Nile can expose a local public asset directory without another HTTP service. Both adapters support the same configuration:

```typescript
rest: {
  baseUrl: "/api",
  allowedOrigins: ["https://app.example.com"],
  enableStatic: true,
  staticDir: "./assets",
}
```

The default directory is `./assets`, relative to the application's working directory. A file at `assets/logo.png` is available at `GET /assets/logo.png`; the asset namespace is independent of `rest.baseUrl`.

Bun native uses Bun file responses and supports GET/HEAD. Hono selects its runtime-specific static adapter. Select `runtime: "bun"` or `runtime: "node"` explicitly; `native: true` requires Bun.

## Decide what belongs in the directory

Static files are public resources, not protected actions. Do not place private documents there expecting action authorization hooks to protect them. Use an authenticated route or your application's storage access mechanism for private files.

Enabling native static serving creates a missing configured directory. Missing files fall through; native serving rejects traversal and symlink escapes. Keep file permissions, persistent volumes and deployment working directories deliberate.

A reverse proxy, CDN or object store may be a better fit for larger deployments. Nile does not provision one or automatically persist files uploaded through an action. See [uploads](/guide/basics/uploads) for the upload boundary and [deployment](/guide/start/deploy) for resource ownership.
