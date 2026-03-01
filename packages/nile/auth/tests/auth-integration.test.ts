import { sign } from "hono/jwt";
import { Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { createEngine } from "../../engine/engine";
import type { Service } from "../../engine/types";
import { createNileContext } from "../../nile/nile";
import type { AuthConfig, AuthContext } from "../types";

const TEST_SECRET = "integration-test-secret";

const authConfig: AuthConfig = { secret: TEST_SECRET };

/** Generate a valid JWT with given claims */
function createToken(claims: Record<string, unknown>): Promise<string> {
  return sign(claims, TEST_SECRET, "HS256");
}

/** Build an AuthContext with Authorization header */
function withBearer(token: string): AuthContext {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);
  return { headers };
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
            const auth = context?.getAuth?.();
            return Ok({
              profile: "data",
              authenticatedUser: auth?.userId ?? null,
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

    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    const result = await engine.executeAction(
      "users",
      "getProfile",
      {},
      nileContext,
      withBearer(token)
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      const value = result.value as Record<string, unknown>;
      expect(value.authenticatedUser).toBe("user-123");
    }
  });

  it("should populate authResult on nileContext after successful auth", async () => {
    const nileContext = createNileContext();
    const token = await createToken({
      userId: "ctx-user",
      organizationId: "ctx-org",
    });

    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    await engine.executeAction(
      "users",
      "getProfile",
      {},
      nileContext,
      withBearer(token)
    );

    expect(nileContext.authResult).toBeDefined();
    expect(nileContext.authResult?.userId).toBe("ctx-user");
    expect(nileContext.authResult?.organizationId).toBe("ctx-org");
  });

  it("should reject protected action when no authContext is provided", async () => {
    const nileContext = createNileContext();
    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    const result = await engine.executeAction(
      "users",
      "getProfile",
      {},
      nileContext
      // no authContext
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("no auth context provided");
    }
  });

  it("should reject protected action with invalid JWT", async () => {
    const nileContext = createNileContext();
    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    const result = await engine.executeAction(
      "users",
      "getProfile",
      {},
      nileContext,
      withBearer("invalid-token")
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

    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    const result = await engine.executeAction(
      "users",
      "getProfile",
      {},
      nileContext,
      withBearer(wrongToken)
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
      // no authContext needed
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      const value = result.value as Record<string, unknown>;
      expect(value.users).toEqual(["alice", "bob"]);
    }
  });

  it("should allow unprotected action even with invalid auth provided", async () => {
    const nileContext = createNileContext();
    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
    });

    const result = await engine.executeAction(
      "users",
      "listPublic",
      {},
      nileContext,
      withBearer("garbage-token")
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
      // no authContext — should fail at auth step
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
    const globalBeforeHook = vi.fn().mockReturnValue(Ok(true));

    const engine = createEngine({
      services: createTestServices(),
      auth: authConfig,
      onBeforeActionHandler: globalBeforeHook,
    });

    await engine.executeAction(
      "users",
      "getProfile",
      {},
      nileContext,
      withBearer(token)
    );

    expect(globalBeforeHook).toHaveBeenCalled();
  });
});

describe("Auth Integration - Context Accessors", () => {
  it("should make getAuth() available with auth data", async () => {
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
            description: "Check auth accessors",
            isProtected: true,
            handler: (_data, context) => {
              const auth = context?.getAuth?.();
              const user = context?.getUser?.();
              return Ok({
                authUserId: auth?.userId,
                authOrgId: auth?.organizationId,
                authClaims: auth?.claims,
                userResult: user,
              });
            },
            accessControl: ["user"],
          },
        ],
      },
    ];

    const engine = createEngine({ services, auth: authConfig });
    const result = await engine.executeAction(
      "test",
      "checkAuth",
      {},
      nileContext,
      withBearer(token)
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      const value = result.value as Record<string, unknown>;
      expect(value.authUserId).toBe("accessor-user");
      expect(value.authOrgId).toBe("accessor-org");
      expect((value.authClaims as Record<string, unknown>).role).toBe("admin");
      const user = value.userResult as Record<string, unknown>;
      expect(user.userId).toBe("accessor-user");
      expect(user.organizationId).toBe("accessor-org");
      expect(user.role).toBe("admin");
    }
  });

  it("should return null from getAuth() when no auth occurred", () => {
    const nileContext = createNileContext();

    expect(nileContext.getAuth()).toBeUndefined();
    expect(nileContext.getUser()).toBeUndefined();
  });
});
