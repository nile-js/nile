import { Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { createNileServer } from "../../nile/server";
import { resolveClientIdentity } from "../../protection/client-address";
import { resolveClientAddress } from "../../protection/http";

/** Build a minimal server with a body size limit. */
async function serverWithLimit(maxBodyBytes: number | false, native = false) {
  const handler = vi.fn(() => Ok(null));
  const server = await createNileServer({
    serverName: "protected",
    services: [
      {
        name: "s",
        description: "s",
        actions: [{ name: "a", description: "a", handler }],
      },
    ],
    runtime: "bun",
    native,
    forceNewInstance: true,
    logServices: false,
    rest: {
      baseUrl: "/api",
      allowedOrigins: [],
      protection: { maxBodyBytes },
    },
  });
  return { server, handler };
}

describe("security: request body size guard", () => {
  it("rejects a body larger than maxBodyBytes despite a false Content-Length", async () => {
    const { server, handler } = await serverWithLimit(20);
    const response = await server.fetch(
      new Request("http://localhost/api/services", {
        method: "POST",
        headers: { "content-length": "1" },
        body: "a".repeat(30),
      })
    );
    expect(response?.status).toBe(413);
    expect(response?.headers.get("x-request-id")).toBeDefined();
    expect(handler).not.toHaveBeenCalled();
    await server.lifecycle.shutdown();
  });

  it("accepts a body within maxBodyBytes", async () => {
    const { server } = await serverWithLimit(100);
    const response = await server.fetch(
      new Request("http://localhost/api/services", {
        method: "POST",
        headers: { "content-length": "5" },
        body: JSON.stringify({ ok: true }),
      })
    );
    expect(response?.status).not.toBe(413);
    await server.lifecycle.shutdown();
  });

  it("disables the limit when maxBodyBytes is false", async () => {
    const { server } = await serverWithLimit(false);
    const response = await server.fetch(
      new Request("http://localhost/api/services", {
        method: "POST",
        headers: { "content-length": "1000" },
        body: "a".repeat(1000),
      })
    );
    expect(response?.status).not.toBe(413);
    await server.lifecycle.shutdown();
  });

  it("rejects a missing-but-huge chunked body once parsed", async () => {
    const { server } = await serverWithLimit(10);
    const response = await server.fetch(
      new Request("http://localhost/api/services", {
        method: "POST",
        body: "a".repeat(50),
      })
    );
    expect(response?.status).toBe(413);
    await server.lifecycle.shutdown();
  });
});

describe("security: client address and proxy trust", () => {
  it("trusts only explicitly configured peers for forwarded addresses", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.99, 198.51.100.5" },
    });
    // Without trustProxy the listener address is the final identity.
    expect(
      resolveClientIdentity(request, { getClientAddress: () => "10.0.0.2" })
    ).toEqual({ address: "10.0.0.2", peer: "10.0.0.2", source: "peer" });
  });

  it("does not accept forwarded addresses from untrusted peers", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "forged, client, proxy" },
    });
    expect(
      resolveClientAddress(request, { getClientAddress: () => "peer" })
    ).toBe("peer");
  });

  it("walks forwarded addresses only through explicitly trusted peers", () => {
    const request = new Request("http://localhost", {
      headers: { "x-forwarded-for": "forged, client, proxy" },
    });
    expect(
      resolveClientAddress(request, {
        getClientAddress: () => "peer",
        trustProxy: (address) => address === "peer" || address === "proxy",
      })
    ).toBe("client");
  });

  it("rejects addresses containing unsafe characters", () => {
    // The unsafe value comes from the listener-provided peer address,
    // not from a header value (Headers rejects control characters).
    const request = new Request("http://localhost");
    expect(
      resolveClientIdentity(request, { getClientAddress: () => "bad\naddress" })
    ).toEqual({ source: "unknown" });
  });
});
