import { sign } from "hono/jwt";
import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import type { AuthConfig } from "../../auth/types";
import { createNileServer } from "../../nile/server";

const SECRET = "native-integration-test-secret-key";
const URL = "http://localhost/api/services";

/** Use a real protected engine action to prove authentication precedes all application work. */
async function setup(auth: AuthConfig = { secret: SECRET }) {
  const events: string[] = [];
  const server = await createNileServer({
    runtime: "bun",
    native: true,
    serverName: "Native auth",
    forceNewInstance: true,
    logServices: false,
    diagnostics: false,
    auth,
    rest: {
      baseUrl: "/api",
      allowedOrigins: [],
      cors: { enabled: false },
    },
    onBeforeActionHandler: ({ nileContext }) => {
      events.push(`before:${nileContext.getSession("rest")?.userId}`);
      return Ok(true);
    },
    services: [
      {
        name: "test",
        description: "Test",
        actions: [
          {
            name: "protected",
            description: "Protected",
            isProtected: true,
            handler: (_payload, context) => {
              events.push("handler");
              return Ok(context?.getSession("rest") ?? {});
            },
          },
        ],
      },
    ],
  });
  if (!server.nativeRest) {
    throw new Error("Native transport not initialized");
  }
  return { app: server.nativeRest, events };
}

/** Sign tokens with the same crypto implementation already used by Nile verification. */
function token({
  expiration = Math.floor(Date.now() / 1000) + 60,
  algorithm = "HS256",
  secret = SECRET,
}: {
  expiration?: number;
  algorithm?: "HS256" | "HS512";
  secret?: string;
} = {}) {
  return sign(
    {
      userId: "user-1",
      organizationId: "org-1",
      role: "maintainer",
      exp: expiration,
    },
    secret,
    algorithm
  );
}

/** Send the protected RPC request using actual Fetch headers. */
function request(headers: Record<string, string>) {
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

describe("native protected action authentication", () => {
  it("accepts Bearer JWT and populates identity before global hooks", async () => {
    const fixture = await setup();
    const response = await fixture.app.fetch(
      request({ authorization: `Bearer ${await token()}` })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { userId: "user-1", organizationId: "org-1", role: "maintainer" },
    });
    expect(fixture.events).toEqual(["before:user-1", "handler"]);
  });
  it("supports a custom token header and signing algorithm", async () => {
    const fixture = await setup({
      secret: SECRET,
      headerName: "x-token",
      algorithm: "HS512",
    });
    const response = await fixture.app.fetch(
      request({ "x-token": `Bearer ${await token({ algorithm: "HS512" })}` })
    );
    expect(response.status).toBe(200);
  });
  it("reads configured cookies with the same session identity", async () => {
    const fixture = await setup({
      secret: SECRET,
      method: "cookie",
      cookieName: "session_jwt",
    });
    const response = await fixture.app.fetch(
      request({
        cookie: `unrelated=1; session_jwt=${await token()}; trailing=2`,
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { userId: "user-1", organizationId: "org-1" },
    });
  });
  it("denies missing, malformed, expired, bad-signature and wrong-algorithm credentials before handlers", async () => {
    const fixture = await setup();
    const cases: Record<string, string>[] = [
      {},
      { authorization: "Basic token" },
      { authorization: "Bearer invalid" },
      { authorization: `Bearer ${await token({ expiration: 1 })}` },
      { authorization: `Bearer ${await token({ secret: "wrong-secret" })}` },
      { authorization: `Bearer ${await token({ algorithm: "HS512" })}` },
    ];
    for (const headers of cases) {
      const response = await fixture.app.fetch(request(headers));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ status: false });
    }
    expect(fixture.events).toEqual([]);
  });
});
