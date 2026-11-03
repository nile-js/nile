---
title: "Public assets"
description: "Serve application assets through the selected HTTP adapter"
---

Serve public files by setting `rest.enableStatic` and `rest.staticDir`. Both HTTP adapters support these settings:

```ts
rest: {
  baseUrl: "/api",
  allowedOrigins: ["https://app.example.com"],
  enableStatic: true,
  staticDir: "./assets",
}
```

The default directory is `./assets`, relative to the application's working directory. A file at `assets/logo.png` is available at `GET /assets/logo.png`; the asset namespace is independent of `rest.baseUrl`.

Bun native serves GET and HEAD with Bun file responses. Hono uses its static adapter for the selected runtime, so set `runtime: "bun"` or `runtime: "node"`.

## Decide what belongs in the directory

Every file in the directory is public: action hooks and JWT checks never run for it. Serve private files from an authenticated route or your storage provider.

Bun native creates the directory when it is missing. A request for a missing file falls through to your other routes, and paths escaping the directory through `..` or symlinks are refused. Set file permissions, persistent volumes and the working directory in your deployment.

For larger deployments, a reverse proxy, CDN or object store usually serves assets better. Uploaded files are saved only where your action writes them. See [uploads](/guide/basics/uploads) and [deployment](/guide/start/deploy).
