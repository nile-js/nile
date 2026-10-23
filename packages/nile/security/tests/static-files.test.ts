import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNativeRequestContext } from "../../native/context";
import { createNativeStaticHandler } from "../../native/static-files";

async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "nile-security-static-"));
  const root = join(parent, "assets");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "hello.txt"), "hello");
  await writeFile(join(parent, "private.txt"), "SECRET");
  await symlink(join(parent, "private.txt"), join(root, "escape.txt"));
  await symlink(parent, join(root, "escape-dir"));
  const content = new Map([
    [
      join(root, "hello.txt"),
      new Blob(["hello"], { type: "text/plain;charset=utf-8" }),
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
    send: (path: string, method = "GET") =>
      run(
        createNativeRequestContext(
          new Request(`http://localhost${path}`, { method })
        )
      ),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("security: static file serving", () => {
  it("denies decoded path traversal", async () => {
    const files = await fixture();
    expect((await files.send("/assets/%2e%2e%2fprivate.txt"))?.status).toBe(
      403
    );
  });

  it("denies backslash traversal", async () => {
    const files = await fixture();
    expect((await files.send("/assets/%5c..%5cprivate.txt"))?.status).toBe(403);
  });

  it("denies NUL bytes in the path", async () => {
    const files = await fixture();
    expect((await files.send("/assets/%00hello.txt"))?.status).toBe(403);
  });

  it("denies symlink escapes outside the asset root", async () => {
    const files = await fixture();
    expect((await files.send("/assets/escape.txt"))?.status).toBe(403);
    expect((await files.send("/assets/escape-dir/private.txt"))?.status).toBe(
      403
    );
  });

  it("does not serve mutating methods on static assets (falls through)", async () => {
    const files = await fixture();
    // Static assets only respond to GET/HEAD; other methods fall through.
    expect(await files.send("/assets/hello.txt", "POST")).toBeUndefined();
    expect(await files.send("/assets/hello.txt", "DELETE")).toBeUndefined();
    expect(await files.send("/assets/hello.txt", "PUT")).toBeUndefined();
  });

  it("falls through (no 403) for a legitimate in-root file", async () => {
    const files = await fixture();
    const res = await files.send("/assets/hello.txt");
    expect(res?.status).toBe(200);
    expect(await res?.text()).toBe("hello");
  });
});
