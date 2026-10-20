import { describe, expect, it } from "vitest";
import { createNativeRequestContext } from "../context";
import { createNativeRouter } from "../router";

/** Use actual Web responses to cover native features without framework context stand-ins. */
function context(path: string, method = "GET") {
  return createNativeRequestContext(
    new Request(`http://localhost${path}`, { method })
  );
}

describe("native context and routing contracts", () => {
  it("supports optional parameters, decoded parameters and GET fallback for HEAD", async () => {
    const router = createNativeRouter();
    router.route("GET", "/users/:id?", (c) => c.json(c.params));
    const missing = context("/users");
    expect(await router.match(missing)?.(missing)).toBeInstanceOf(Response);
    expect(missing.params.id).toBeUndefined();
    const present = context("/users/a%20b", "HEAD");
    expect(router.match(present)).toBeDefined();
    expect(present.params.id).toBe("a b");
  });
  it("rejects malformed route configuration immediately", () => {
    const router = createNativeRouter();
    expect(() =>
      router.route("GET", "/:bad-name", (c) => c.text("ok"))
    ).toThrow("parameter");
    expect(() => router.route("GET", "/a/*/b", (c) => c.text("ok"))).toThrow(
      "terminal"
    );
  });
  it("preserves explicit response headers, cookies and a streaming body", async () => {
    const c = context("/stream");
    c.setHeader("X-Value", "prepared");
    c.headers.append("Set-Cookie", "first=1; Path=/");
    c.headers.append("Set-Cookie", "second=2; Path=/");
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("chunk"));
        controller.close();
      },
    });
    const response = c.respond(
      new Response(stream, { headers: { "X-Value": "handler" } })
    );
    expect(response.headers.get("X-Value")).toBe("handler");
    expect(response.headers.getSetCookie()).toEqual([
      "first=1; Path=/",
      "second=2; Path=/",
    ]);
    expect(await response.text()).toBe("chunk");
  });
  it("can modify immutable Fetch response headers through native response adoption", () => {
    const c = context("/redirect");
    c.respond(Response.redirect("https://example.test", 302));
    c.setHeader("X-Native", "yes");
    expect(c.response?.headers.get("X-Native")).toBe("yes");
    expect(c.response?.headers.get("location")).toBe("https://example.test/");
  });
});
