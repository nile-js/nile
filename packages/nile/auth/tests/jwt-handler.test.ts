import { sign } from "hono/jwt";
import { describe, expect, it } from "vitest";
import { verifyJWT } from "../jwt-handler";
import type { AuthConfig, AuthContext } from "../types";

const TEST_SECRET = "test-secret-key-for-jwt-auth";

/** Generate a valid JWT with given claims */
function createToken(
  claims: Record<string, unknown>,
  secret = TEST_SECRET
): Promise<string> {
  return sign(claims, secret, "HS256");
}

/** Build an AuthContext with Authorization header */
function withBearerToken(token: string): AuthContext {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);
  return { headers };
}

/** Build an AuthContext with a cookie */
function withCookie(name: string, token: string): AuthContext {
  return { cookies: { [name]: token } };
}

const defaultConfig: AuthConfig = { secret: TEST_SECRET };

describe("verifyJWT - Token Extraction from Header", () => {
  it("should verify a valid JWT from Authorization header", async () => {
    const token = await createToken({
      userId: "user-123",
      organizationId: "org-456",
    });

    const result = await verifyJWT(withBearerToken(token), defaultConfig);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.userId).toBe("user-123");
      expect(result.value.organizationId).toBe("org-456");
    }
  });

  it("should return Err when no Authorization header is present", async () => {
    const result = await verifyJWT({ headers: new Headers() }, defaultConfig);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("No JWT token found");
    }
  });

  it("should return Err when Authorization header uses wrong scheme", async () => {
    const headers = new Headers();
    headers.set("authorization", "Basic dXNlcjpwYXNz");

    const result = await verifyJWT({ headers }, defaultConfig);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("Bearer scheme");
    }
  });

  it("should return Err when headers object is undefined", async () => {
    const result = await verifyJWT({}, defaultConfig);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("No JWT token found");
    }
  });

  it("should use custom header name when configured", async () => {
    const token = await createToken({
      userId: "user-1",
      organizationId: "org-1",
    });
    const headers = new Headers();
    headers.set("x-api-token", `Bearer ${token}`);

    const config: AuthConfig = {
      secret: TEST_SECRET,
      method: "header",
      headerName: "x-api-token",
    };

    const result = await verifyJWT({ headers }, config);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.userId).toBe("user-1");
    }
  });
});

describe("verifyJWT - Token Extraction from Cookie", () => {
  const cookieConfig: AuthConfig = {
    secret: TEST_SECRET,
    method: "cookie",
  };

  it("should verify a valid JWT from default cookie name", async () => {
    const token = await createToken({
      userId: "cookie-user",
      organizationId: "cookie-org",
    });

    const result = await verifyJWT(
      withCookie("auth_token", token),
      cookieConfig
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.userId).toBe("cookie-user");
      expect(result.value.organizationId).toBe("cookie-org");
    }
  });

  it("should use custom cookie name when configured", async () => {
    const token = await createToken({
      userId: "user-custom",
      organizationId: "org-custom",
    });

    const config: AuthConfig = {
      secret: TEST_SECRET,
      method: "cookie",
      cookieName: "session_jwt",
    };

    const result = await verifyJWT(withCookie("session_jwt", token), config);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.userId).toBe("user-custom");
    }
  });

  it("should return Err when cookie is missing", async () => {
    const result = await verifyJWT({ cookies: {} }, cookieConfig);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("No JWT token found in cookie");
    }
  });

  it("should return Err when cookies object is undefined", async () => {
    const result = await verifyJWT({}, cookieConfig);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("No JWT token found");
    }
  });
});

describe("verifyJWT - Claims Extraction", () => {
  it("should extract userId from 'sub' claim", async () => {
    const token = await createToken({
      sub: "sub-user",
      organizationId: "org-1",
    });

    const result = await verifyJWT(withBearerToken(token), defaultConfig);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.userId).toBe("sub-user");
    }
  });

  it("should extract userId from 'id' claim", async () => {
    const token = await createToken({
      id: "id-user",
      organizationId: "org-1",
    });

    const result = await verifyJWT(withBearerToken(token), defaultConfig);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.userId).toBe("id-user");
    }
  });

  it("should prefer 'userId' over 'id' and 'sub'", async () => {
    const token = await createToken({
      userId: "preferred",
      id: "fallback-id",
      sub: "fallback-sub",
      organizationId: "org-1",
    });

    const result = await verifyJWT(withBearerToken(token), defaultConfig);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.userId).toBe("preferred");
    }
  });

  it("should extract organizationId from 'organization_id' claim", async () => {
    const token = await createToken({
      userId: "user-1",
      organization_id: "snake-org",
    });

    const result = await verifyJWT(withBearerToken(token), defaultConfig);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.organizationId).toBe("snake-org");
    }
  });

  it("should extract organizationId from 'orgId' claim", async () => {
    const token = await createToken({
      userId: "user-1",
      orgId: "short-org",
    });

    const result = await verifyJWT(withBearerToken(token), defaultConfig);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.organizationId).toBe("short-org");
    }
  });

  it("should include raw claims in the result", async () => {
    const token = await createToken({
      userId: "user-1",
      organizationId: "org-1",
      role: "admin",
      permissions: ["read", "write"],
    });

    const result = await verifyJWT(withBearerToken(token), defaultConfig);

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.claims.role).toBe("admin");
      expect(result.value.claims.permissions).toEqual(["read", "write"]);
    }
  });

  it("should return Err when userId is missing from claims", async () => {
    const token = await createToken({
      organizationId: "org-1",
      // no userId, id, or sub
    });

    const result = await verifyJWT(withBearerToken(token), defaultConfig);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("Missing userId or organizationId");
    }
  });

  it("should return Err when organizationId is missing from claims", async () => {
    const token = await createToken({
      userId: "user-1",
      // no organizationId, organization_id, or orgId
    });

    const result = await verifyJWT(withBearerToken(token), defaultConfig);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("Missing userId or organizationId");
    }
  });
});

describe("verifyJWT - Invalid Tokens", () => {
  it("should return Err for a tampered token", async () => {
    const token = await createToken({
      userId: "user-1",
      organizationId: "org-1",
    });

    // Tamper with the token payload
    const parts = token.split(".");
    parts[1] = `${parts[1]}tampered`;
    const tamperedToken = parts.join(".");

    const result = await verifyJWT(
      withBearerToken(tamperedToken),
      defaultConfig
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("JWT authentication failed");
    }
  });

  it("should return Err for a token signed with wrong secret", async () => {
    const token = await createToken(
      { userId: "user-1", organizationId: "org-1" },
      "wrong-secret"
    );

    const result = await verifyJWT(withBearerToken(token), defaultConfig);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("JWT authentication failed");
    }
  });

  it("should return Err for a malformed token string", async () => {
    const result = await verifyJWT(
      withBearerToken("not.a.valid.jwt"),
      defaultConfig
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("JWT authentication failed");
    }
  });

  it("should return Err for an empty Bearer token", async () => {
    const headers = new Headers();
    headers.set("authorization", "Bearer ");

    const result = await verifyJWT({ headers }, defaultConfig);

    expect(result.isErr).toBe(true);
  });
});
