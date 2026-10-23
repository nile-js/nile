import { sign } from "hono/jwt";
import { describe, expect, it } from "vitest";
import { verifyJWT } from "../../auth/jwt-handler";
import type { AuthConfig, AuthContext } from "../../auth/types";

const TEST_SECRET = "test-secret-key-for-jwt-auth";

function createToken(
  claims: Record<string, unknown>,
  secret = TEST_SECRET,
  algorithm = "HS256"
): Promise<string> {
  return sign(claims, secret, algorithm);
}

function withBearerToken(token: string): AuthContext {
  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);
  return { headers };
}

const defaultConfig: AuthConfig = { secret: TEST_SECRET };

describe("security: JWT authentication", () => {
  it("verifies a valid JWT and extracts claims", async () => {
    const token = await createToken({
      userId: "user-1",
      organizationId: "org-1",
    });
    const result = await verifyJWT(withBearerToken(token), defaultConfig);
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value.userId).toBe("user-1");
      expect(result.value.organizationId).toBe("org-1");
    }
  });

  it("rejects a token signed with the wrong secret", async () => {
    const token = await createToken(
      { userId: "user-1", organizationId: "org-1" },
      "wrong-secret"
    );
    const result = await verifyJWT(withBearerToken(token), defaultConfig);
    expect(result.isErr).toBe(true);
  });

  it("rejects a tampered token", async () => {
    const token = await createToken({
      userId: "user-1",
      organizationId: "org-1",
    });
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.tampered-signature`;
    const result = await verifyJWT(withBearerToken(tampered), defaultConfig);
    expect(result.isErr).toBe(true);
  });

  it("rejects a token signed with the wrong algorithm", async () => {
    const token = await createToken(
      { userId: "user-1", organizationId: "org-1" },
      TEST_SECRET,
      "HS512"
    );
    const result = await verifyJWT(withBearerToken(token), defaultConfig);
    expect(result.isErr).toBe(true);
  });

  it("rejects an expired token without echoing the token text", async () => {
    const token = await sign(
      {
        userId: "user-1",
        organizationId: "org-1",
        exp: Math.floor(Date.now() / 1000) - 100,
      },
      TEST_SECRET,
      "HS256"
    );
    const result = await verifyJWT(withBearerToken(token), defaultConfig);
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).not.toContain(token);
      expect(result.error.length).toBeLessThan(200);
    }
  });

  it("rejects missing Authorization header", async () => {
    const result = await verifyJWT({ headers: new Headers() }, defaultConfig);
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("No JWT token found");
    }
  });

  it("rejects wrong Authorization scheme", async () => {
    const headers = new Headers();
    headers.set("authorization", "Basic dXNlcjpwYXNz");
    const result = await verifyJWT({ headers }, defaultConfig);
    expect(result.isErr).toBe(true);
  });

  it("rejects a malformed token string", async () => {
    const result = await verifyJWT(
      withBearerToken("not-a-jwt-at-all"),
      defaultConfig
    );
    expect(result.isErr).toBe(true);
  });

  it("rejects an empty Bearer token", async () => {
    const headers = new Headers();
    headers.set("authorization", "Bearer ");
    const result = await verifyJWT({ headers }, defaultConfig);
    expect(result.isErr).toBe(true);
  });

  it("never includes token text in invalid-token failure messages", async () => {
    const token = await createToken({
      userId: "user-1",
      organizationId: "org-1",
    });
    const tampered = `${token.slice(0, -5)}xxxxx`;
    const result = await verifyJWT(withBearerToken(tampered), defaultConfig);
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).not.toContain(tampered);
      expect(result.error).not.toContain(token);
    }
  });
});
