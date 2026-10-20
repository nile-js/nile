import { describe, expect, it, vi } from "vitest";
import { createNativeRequestContext } from "../context";
import { createNativeCors } from "../cors";

describe("native CORS preflight error recovery", () => {
  it("does not retry a throwing origin callback while formatting the error response", async () => {
    const callback = vi.fn(() => {
      throw new Error("origin failed");
    });
    const cors = createNativeCors({
      config: {
        baseUrl: "/api",
        allowedOrigins: [],
        cors: { defaults: { origin: callback } },
      },
      services: [],
    });
    const context = createNativeRequestContext(
      new Request("http://localhost/api/services", {
        method: "OPTIONS",
        headers: { Origin: "https://example.com" },
      })
    );
    expect(() => cors?.preflight(context)).toThrow("origin failed");
    context.json(
      { status: false, message: "Internal server error", data: {} },
      500
    );
    await cors?.applyFallback(context);
    cors?.finish(context);
    expect(callback).toHaveBeenCalledOnce();
    expect(context.response?.status).toBe(500);
    expect(context.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(context.headers.has("Vary")).toBe(false);
  });

  it("does not duplicate preflight Vary values during normal transport finish", async () => {
    const cors = createNativeCors({
      config: { baseUrl: "/api", allowedOrigins: ["https://example.com"] },
      services: [],
    });
    const context = createNativeRequestContext(
      new Request("http://localhost/api/services", { method: "OPTIONS" })
    );
    const response = await cors?.preflight(context);
    if (response) {
      context.respond(response);
    }
    await cors?.applyFallback(context);
    cors?.finish(context);
    expect(context.headers.get("Vary")).toBe(
      "Origin, Access-Control-Request-Headers"
    );
  });
});
