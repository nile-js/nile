import { expect, it } from "vitest";
import { normalizeIp, resolveClientIdentity } from "./client-address";

it("normalizes mapped IPv4 and reports the trusted address source", () => {
  expect(normalizeIp(" ::FFFF:127.0.0.1 ")).toBe("127.0.0.1");
  const request = new Request("http://localhost", {
    headers: { "x-forwarded-for": "198.51.100.9, ::ffff:10.0.0.2" },
  });
  const trusted = (ip: string) => ["127.0.0.1", "10.0.0.2"].includes(ip);
  expect(
    resolveClientIdentity(request, {
      getClientAddress: () => "::ffff:127.0.0.1",
      trustProxy: trusted,
    })
  ).toEqual({
    address: "198.51.100.9",
    peer: "127.0.0.1",
    source: "forwarded",
  });
  expect(
    resolveClientIdentity(request, {
      getClientAddress: () => "203.0.113.7",
      trustProxy: trusted,
    })
  ).toEqual({ address: "203.0.113.7", peer: "203.0.113.7", source: "peer" });
  expect(
    resolveClientIdentity(
      new Request("http://localhost", {
        headers: { "x-forwarded-for": "198.51.100.9" },
      }),
      {
        getClientAddress: () => "::ffff:127.0.0.1",
        trustProxy: (ip) => ip === "::ffff:127.0.0.1",
      }
    ).address
  ).toBe("198.51.100.9");
  expect(resolveClientIdentity(request)).toEqual({ source: "unknown" });
});
