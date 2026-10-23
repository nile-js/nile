import { sign } from "hono/jwt";
import { Ok } from "slang-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthConfig } from "../../auth/types";
import { createNileServer } from "../../nile/server";

const SECRET = "cookie-fast-path-test-secret";
const URL = "http://localhost/api/services";

afterEach(() => vi.restoreAllMocks());

/** Exercise the actual protected action and session lifecycle through either public transport. */
async function setup(native: boolean, auth: AuthConfig) {
  const events: string[] = [];
  const server = await createNileServer({
    serverName: "Authentication credentials",
    runtime: "bun",
    ...(native ? { native: true as const } : { native: false as const }),
    forceNewInstance: true,
    logServices: false,
    auth,
    rest: { baseUrl: "/api", allowedOrigins: [], cors: { enabled: false } },
    onBeforeActionHandler: ({ nileContext }) => {
      events.push(`before:${nileContext.getSession("rest")?.userId}`);
      return Ok(true);
    },
    services: [
      {
        name: "test",
        description: "Credential regression",
        actions: [
          {
            name: "protected",
            description: "Protected",
            isProtected: true,
            handler: (_payload, context) => {
              events.push("handler");
              return Ok(context?.getSession("rest"));
            },
          },
        ],
      },
    ],
  });
  const fetch = native ? server.nativeRest?.fetch : server.rest?.app.fetch;
  if (!fetch) {
    throw new Error("Expected configured transport");
  }
  return { fetch, events };
}

/** Create a signed identity rather than bypassing verification in branch tests. */
function createToken() {
  return sign(
    {
      userId: "buyer-1",
      organizationId: "store-1",
      role: "buyer",
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    SECRET,
    "HS256"
  );
}

/** Keep the original Request and Headers visible to assert unrelated cookies are never read. */
function createRequest(headers: Record<string, string>) {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      intent: "execute",
      service: "test",
      action: "protected",
      payload: {},
    }),
  });
}

for (const native of [false, true]) {
  describe(`${native ? "Bun native" : "Hono"} authentication credential selection`, () => {
    it.each([
      { method: undefined, headerName: undefined },
      { method: "header" as const, headerName: undefined },
      { method: "header" as const, headerName: "x-session" },
    ])("does not read cookies for header authentication %j", async (options) => {
      const fixture = await setup(native, { secret: SECRET, ...options });
      const request = createRequest({
        [options.headerName ?? "authorization"]:
          `Bearer ${await createToken()}`,
        cookie: "auth_token=invalid; unrelated=%broken",
      });
      const readHeader = vi.spyOn(request.headers, "get");
      const response = await fixture.fetch(request);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: { userId: "buyer-1", organizationId: "store-1", role: "buyer" },
      });
      expect(fixture.events).toEqual(["before:buyer-1", "handler"]);
      expect(
        readHeader.mock.calls.some(([name]) => name.toLowerCase() === "cookie")
      ).toBe(false);
    });

    it.each([
      undefined,
      "custom_session",
    ])("decodes the configured cookie %s and ignores a conflicting header", async (cookieName) => {
      const fixture = await setup(native, {
        secret: SECRET,
        method: "cookie",
        cookieName,
      });
      const token = await createToken();
      const encoded = `%${token.charCodeAt(0).toString(16)}${token.slice(1)}`;
      const response = await fixture.fetch(
        createRequest({
          authorization: "Bearer invalid",
          cookie: `unrelated=1; ${cookieName ?? "auth_token"}=${encoded}; trailing=2`,
        })
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: { userId: "buyer-1", organizationId: "store-1" },
      });
      expect(fixture.events).toEqual(["before:buyer-1", "handler"]);
    });

    it("rejects missing/invalid cookies without falling back to valid header credentials", async () => {
      const fixture = await setup(native, { secret: SECRET, method: "cookie" });
      for (const cookie of ["unrelated=1", "auth_token=invalid"]) {
        const response = await fixture.fetch(
          createRequest({
            cookie,
            authorization: `Bearer ${await createToken()}`,
          })
        );
        expect(response.status).toBe(400);
        expect(await response.json()).toMatchObject({ status: false });
      }
      expect(fixture.events).toEqual([]);
    });
  });
}
