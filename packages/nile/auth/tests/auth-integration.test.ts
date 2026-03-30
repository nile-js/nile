import type { Context as HonoContext } from "hono";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../../engine/engine";
import type { Service } from "../../engine/types";
import { createNileContext } from "../../nile/nile";
import { runInRequestScope } from "../../nile/request-scope";
import type { AuthConfig } from "../types";

const TEST_SECRET = "integration-test-secret";

const authConfig: AuthConfig = { secret: TEST_SECRET };

/** Generate a valid JWT with given claims */
function createToken(claims: Record<string, unknown>): Promise<string> {
  return sign(claims, TEST_SECRET, "HS256");
}

/**
 * Captures a real Hono Context via a mini Hono app. Returns the captured
 * context for use in runInRequestScope.
 */
async function captureHonoContext(token?: string): Promise<HonoContext> {
  const app = new Hono();
  let captured: HonoContext | null = null;

  app.post("/capture", (c) => {
    captured = c;
    return c.json({ ok: true });
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  await app.request("/capture", {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  if (!captured) {
    throw new Error("Failed to capture Hono context");
  }
  return captured;
}

/** Services with both protected and unprotected actions */
function createTestServices(): Service[] {
  return [
    {
      name: "users",
      description: "User management",
      actions: [
        {
          name: "getProfile",
          description: "Get user profile (protected)",
          isProtected: true,
          handler: (_data, context) => {
            const session = context?.getSession("rest");
            return Ok({
              profile: "data",
              authenticatedUser: session?.userId ?? null,
            });
          },
          accessControl: ["user"],
        },
        {
          name: "listPublic",
          description: "List public users (unprotected)",
          isProtected: false,
          handler: () => Ok({ users: ["alice", "bob"] }),
          accessControl: ["public"],
        },
      ],
    },
  ];
}

describe("Auth Integration - Protected Actions", () => {
  it("should allow access to protected action with valid JWT", async () => {
    const nileContext = createNileContext();
    const token = await createToken({
      userId: "user-123",
      organizationId: "org-456",
    });
    const honoCtx = await captureHonoContext(token);

    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    const result = await runInRequestScope(
      { rest: honoCtx, sessions: {} },
      () => engine.executeAction("users", "getProfile", {}, nileContext)
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      const value = result.value as Record<string, unknown>;
      expect(value.authenticatedUser).toBe("user-123");
    }
  });

  it("should populate session on nileContext after successful auth", async () => {
    const nileContext = createNileContext();
    const token = await createToken({
      userId: "ctx-user",
      organizationId: "ctx-org",
    });
    const honoCtx = await captureHonoContext(token);

    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    await runInRequestScope({ rest: honoCtx, sessions: {} }, async () => {
      await engine.executeAction("users", "getProfile", {}, nileContext);

      const session = nileContext.getSession("rest");
      expect(session).toBeDefined();
      expect(session?.userId).toBe("ctx-user");
      expect(session?.organizationId).toBe("ctx-org");
    });
  });

  it("should reject protected action when no rest context is set", async () => {
    const nileContext = createNileContext();
    // No runInRequestScope — get("rest") returns undefined
    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    const result = await engine.executeAction(
      "users",
      "getProfile",
      {},
      nileContext
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("no request context available");
    }
  });

  it("should reject protected action with invalid JWT", async () => {
    const nileContext = createNileContext();
    const honoCtx = await captureHonoContext("invalid-token");

    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    const result = await runInRequestScope(
      { rest: honoCtx, sessions: {} },
      () => engine.executeAction("users", "getProfile", {}, nileContext)
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("JWT authentication failed");
    }
  });

  it("should reject protected action with token signed by wrong secret", async () => {
    const nileContext = createNileContext();
    const wrongToken = await sign(
      { userId: "user-1", organizationId: "org-1" },
      "wrong-secret",
      "HS256"
    );
    const honoCtx = await captureHonoContext(wrongToken);

    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    const result = await runInRequestScope(
      { rest: honoCtx, sessions: {} },
      () => engine.executeAction("users", "getProfile", {}, nileContext)
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("JWT authentication failed");
    }
  });
});

describe("Auth Integration - Unprotected Actions", () => {
  it("should allow access to unprotected action without auth", async () => {
    const nileContext = createNileContext();
    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    const result = await engine.executeAction(
      "users",
      "listPublic",
      {},
      nileContext
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      const value = result.value as Record<string, unknown>;
      expect(value.users).toEqual(["alice", "bob"]);
    }
  });

  it("should allow unprotected action even with invalid auth context", async () => {
    const nileContext = createNileContext();
    const honoCtx = await captureHonoContext("garbage-token");

    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    const result = await runInRequestScope(
      { rest: honoCtx, sessions: {} },
      () => engine.executeAction("users", "listPublic", {}, nileContext)
    );

    expect(result.isOk).toBe(true);
  });
});

describe("Auth Integration - No Auth Config", () => {
  it("should skip auth entirely when no auth config is provided", async () => {
    const nileContext = createNileContext();
    const engine = createEngine({
      services: createTestServices(),
      // no auth config
    });

    // Even a protected action should pass when server has no auth configured
    const result = await engine.executeAction(
      "users",
      "getProfile",
      {},
      nileContext
    );

    expect(result.isOk).toBe(true);
  });
});

describe("Auth Integration - Auth Runs Before Global Hooks", () => {
  it("should reject auth before global before hook runs", async () => {
    const nileContext = createNileContext();
    // No request scope — auth will fail for protected action
    const globalBeforeHook = vi.fn().mockReturnValue(Ok(true));

    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
      onBeforeActionHandler: globalBeforeHook,
    });

    const result = await engine.executeAction(
      "users",
      "getProfile",
      {},
      nileContext
    );

    expect(result.isErr).toBe(true);
    // Global before hook should NOT have been called since auth failed first
    expect(globalBeforeHook).not.toHaveBeenCalled();
  });

  it("should run global before hook after successful auth", async () => {
    const nileContext = createNileContext();
    const token = await createToken({
      userId: "user-1",
      organizationId: "org-1",
    });
    const honoCtx = await captureHonoContext(token);
    const globalBeforeHook = vi.fn().mockReturnValue(Ok(true));

    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
      onBeforeActionHandler: globalBeforeHook,
    });

    await runInRequestScope({ rest: honoCtx, sessions: {} }, () =>
      engine.executeAction("users", "getProfile", {}, nileContext)
    );

    expect(globalBeforeHook).toHaveBeenCalled();
  });
});

describe("Auth Integration - Session Accessors", () => {
  it("should make getSession('rest') available with auth data after verification", async () => {
    const nileContext = createNileContext();
    const token = await createToken({
      userId: "accessor-user",
      organizationId: "accessor-org",
      role: "admin",
    });

    const services: Service[] = [
      {
        name: "test",
        description: "Test",
        actions: [
          {
            name: "checkAuth",
            description: "Check session after auth",
            isProtected: true,
            handler: (_data, context) => {
              const session = context?.getSession("rest");
              return Ok({
                userId: session?.userId,
                organizationId: session?.organizationId,
                role: session?.role,
              });
            },
            accessControl: ["user"],
          },
        ],
      },
    ];

    const honoCtx = await captureHonoContext(token);
    const engine = createEngine({ services, auth: authConfig });

    const result = await runInRequestScope(
      { rest: honoCtx, sessions: {} },
      () => engine.executeAction("test", "checkAuth", {}, nileContext)
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      const value = result.value as Record<string, unknown>;
      expect(value.userId).toBe("accessor-user");
      expect(value.organizationId).toBe("accessor-org");
      expect(value.role).toBe("admin");
    }
  });

  it("should return undefined from getSession when no request scope active", () => {
    const nileContext = createNileContext();
    expect(nileContext.getSession("rest")).toBeUndefined();
  });
});
