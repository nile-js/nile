import { mkdirSync, realpathSync } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { safeTry } from "slang-ts";
import type { NativeRequestContext, NativeRestConfig } from "./types";

/** Reject paths outside the canonical root, including filesystem symlink escapes. */
function isInsideRoot(root: string, target: string) {
  const path = relative(root, target);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/** Missing public assets fall through; access and filesystem failures remain visible to operators. */
function isMissingFile(message: string) {
  return message.startsWith("ENOENT:") || message.startsWith("ENOTDIR:");
}

/** Reject path encodings that could be interpreted differently by filesystem adapters. */
function isUnsafePath(path: string) {
  return (
    path.includes("\0") || path.includes("\\") || path.split("/").includes("..")
  );
}

/** Resolve directory indexes and validate both the target and any index symlink. */
async function resolvePublicFile(root: string, path: string) {
  let candidate = await realpath(resolve(root, path));
  if (!isInsideRoot(root, candidate)) {
    return null;
  }
  let metadata = await stat(candidate);
  if (metadata.isDirectory()) {
    candidate = await realpath(resolve(candidate, "index.html"));
    if (!isInsideRoot(root, candidate)) {
      return null;
    }
    metadata = await stat(candidate);
  }
  return { path: candidate, isFile: metadata.isFile(), size: metadata.size };
}

/** Serve only the asset namespace and read-only HTTP methods. */
function isAssetRequest(context: NativeRequestContext) {
  return (
    ["GET", "HEAD"].includes(context.request.method) &&
    context.path.startsWith("/assets/")
  );
}

/** Stream native Bun files under /assets while denying decoded traversal and symlink escapes. */
export function createNativeStaticHandler(config: NativeRestConfig) {
  if (!config.enableStatic) {
    return;
  }
  if (typeof Bun === "undefined") {
    throw new Error("Native static serving requires Bun.file");
  }
  const directory = resolve(config.staticDir ?? "./assets");
  mkdirSync(directory, { recursive: true });
  const root = realpathSync(directory);

  return async (
    context: NativeRequestContext
  ): Promise<Response | undefined> => {
    const { method } = context.request;
    if (!isAssetRequest(context)) {
      return;
    }
    const decoded = await safeTry(() =>
      decodeURIComponent(context.path.slice(8))
    );
    if (decoded.isErr) {
      return new Response(null, { status: 400 });
    }
    const path = decoded.value;
    if (isUnsafePath(path)) {
      return new Response(null, { status: 403 });
    }
    const candidate = resolve(root, path);
    if (!isInsideRoot(root, candidate)) {
      return new Response(null, { status: 403 });
    }
    const found = await safeTry(() => resolvePublicFile(root, path));
    if (found.isErr) {
      if (isMissingFile(found.error)) {
        return;
      }
      throw new Error(found.error);
    }
    if (found.value === null) {
      return new Response(null, { status: 403 });
    }
    if (!found.value.isFile) {
      return;
    }
    const file = Bun.file(found.value.path);
    const headers = new Headers(context.headers);
    headers.set("Content-Type", file.type || "application/octet-stream");
    headers.set("Content-Length", String(found.value.size));
    return new Response(method === "HEAD" ? null : file, { headers });
  };
}
