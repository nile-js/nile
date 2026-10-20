import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeRequestContext } from "../context";
import { createNativeStaticHandler } from "../static-files";

/** Preserve real filesystem routing in Node-hosted tests, replacing only Bun's streaming blob API. */
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "nile-native-static-"));
  const root = join(parent, "assets");
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "hello.txt"), "hello");
  await writeFile(join(root, "docs", "index.html"), "<h1>Index</h1>");
  await writeFile(join(parent, "private.txt"), "private");
  await symlink(join(parent, "private.txt"), join(root, "escape.txt"));
  await symlink(parent, join(root, "escape-dir"));
  await mkdir(join(root, "index-escape"));
  await symlink(
    join(parent, "private.txt"),
    join(root, "index-escape", "index.html")
  );
  await symlink(join(root, "hello.txt"), join(root, "inside.txt"));
  const content = new Map([
    [
      join(root, "hello.txt"),
      new Blob([await readFile(join(root, "hello.txt"))], {
        type: "text/plain;charset=utf-8",
      }),
    ],
    [
      join(root, "docs", "index.html"),
      new Blob([await readFile(join(root, "docs", "index.html"))], {
        type: "text/html;charset=utf-8",
      }),
    ],
  ]);
  vi.stubGlobal("Bun", { file: (path: string) => content.get(path) });
  const run = createNativeStaticHandler({
    baseUrl: "/api",
    allowedOrigins: [],
    enableStatic: true,
    staticDir: root,
  });
  if (!run) {
    throw new Error("Expected a configured static handler");
  }
  return {
    parent,
    root,
    send: (path: string, method = "GET") =>
      run(
        createNativeRequestContext(
          new Request(`http://localhost${path}`, { method })
        )
      ),
    run,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("native static assets", () => {
  it("does no work when static assets are disabled", () => {
    expect(
      createNativeStaticHandler({ baseUrl: "/api", allowedOrigins: [] })
    ).toBeUndefined();
  });

  it("serves file content and index documents with MIME and length headers", async () => {
    const files = await fixture();
    const response = await files.send("/assets/hello.txt");
    expect(response?.status).toBe(200);
    expect(await response?.text()).toBe("hello");
    expect(response?.headers.get("content-type")).toContain("text/plain");
    expect(response?.headers.get("content-length")).toBe("5");
    expect(await (await files.send("/assets/docs/"))?.text()).toBe(
      "<h1>Index</h1>"
    );
    expect(await (await files.send("/assets/inside.txt"))?.text()).toBe(
      "hello"
    );
  });

  it("serves HEAD metadata without returning file bytes", async () => {
    const files = await fixture();
    const response = await files.send("/assets/hello.txt", "HEAD");
    expect(response?.status).toBe(200);
    expect(response?.headers.get("content-length")).toBe("5");
    expect(await response?.text()).toBe("");
  });

  it("falls through on missing files, other prefixes and unsupported methods", async () => {
    const files = await fixture();
    expect(await files.send("/assets/missing.txt")).toBeUndefined();
    expect(await files.send("/api/hello.txt")).toBeUndefined();
    expect(await files.send("/assets/hello.txt", "POST")).toBeUndefined();
  });

  it("denies decoded traversal, backslashes, NULs and symlink escapes", async () => {
    const files = await fixture();
    for (const path of [
      "/assets/%2e%2e%2fprivate.txt",
      "/assets/%5c..%5cprivate.txt",
      "/assets/%00hello.txt",
      "/assets/escape.txt",
      "/assets/escape-dir/private.txt",
      "/assets/index-escape/",
    ]) {
      expect((await files.send(path))?.status).toBe(403);
    }
    expect((await files.send("/assets/%GG"))?.status).toBe(400);
  });

  it("retains headers from earlier native middleware", async () => {
    const files = await fixture();
    const request = createNativeRequestContext(
      new Request("http://localhost/assets/hello.txt")
    );
    request.setHeader("x-request-id", "kept");
    expect((await files.run(request))?.headers.get("x-request-id")).toBe(
      "kept"
    );
  });

  it("creates an enabled directory and rejects a missing Bun runtime immediately", async () => {
    const files = await fixture();
    expect(
      createNativeStaticHandler({
        baseUrl: "/api",
        allowedOrigins: [],
        enableStatic: true,
        staticDir: join(files.parent, "created"),
      })
    ).toBeTypeOf("function");
    vi.stubGlobal("Bun", undefined);
    expect(() =>
      createNativeStaticHandler({
        baseUrl: "/api",
        allowedOrigins: [],
        enableStatic: true,
        staticDir: files.root,
      })
    ).toThrow("requires Bun.file");
  });
});
