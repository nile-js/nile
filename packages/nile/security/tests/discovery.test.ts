import { describe, expect, it } from "vitest";
import { checkNativeDiscoveryAccess } from "../../native/discovery";

describe("security: API discovery access control", () => {
  const disabledConfig = { discovery: { enabled: false } };
  const enabledConfig = { discovery: { enabled: true } };
  const secretConfig = {
    discovery: { enabled: true, secret: "super-secret" },
  };

  it("denies explore and schema by default when discovery is disabled", () => {
    for (const intent of ["explore", "schema"]) {
      expect(
        checkNativeDiscoveryAccess(intent, undefined, disabledConfig)
      ).toEqual({ allowed: false, message: "API discovery is disabled" });
    }
  });

  it("allows execute and other intents even when discovery is disabled", () => {
    for (const intent of ["execute", "introspect", "other"]) {
      expect(
        checkNativeDiscoveryAccess(intent, undefined, disabledConfig)
      ).toEqual({ allowed: true });
    }
  });

  it("allows explore and schema when discovery is enabled without a secret", () => {
    for (const intent of ["explore", "schema"]) {
      expect(
        checkNativeDiscoveryAccess(intent, undefined, enabledConfig)
      ).toEqual({ allowed: true });
    }
  });

  it("denies explore when a secret is required but missing", () => {
    expect(
      checkNativeDiscoveryAccess("explore", undefined, secretConfig)
    ).toEqual({
      allowed: false,
      message: "Invalid or missing discovery secret",
    });
  });

  it("denies explore when the discovery secret is wrong", () => {
    expect(
      checkNativeDiscoveryAccess(
        "explore",
        { discoverySecret: "wrong" },
        secretConfig
      )
    ).toEqual({
      allowed: false,
      message: "Invalid or missing discovery secret",
    });
  });

  it("allows explore when the discovery secret matches", () => {
    expect(
      checkNativeDiscoveryAccess(
        "explore",
        { discoverySecret: "super-secret" },
        secretConfig
      )
    ).toEqual({ allowed: true });
  });
});
