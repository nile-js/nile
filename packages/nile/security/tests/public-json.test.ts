import { Ok } from "slang-ts";
import { describe, expect, it } from "vitest";
import { serializePublicJson } from "../../diagnostics/public-json";
import { createNileServer } from "../../nile/server";

const payload = {
  raw: "PRIVATE_RAW",
  nested: { raw: "PRIVATE_RAW", items: [{ keep: 1, raw: "PRIVATE_RAW" }] },
};
const expected = { nested: { items: [{ keep: 1 }] } };

describe("raw never crosses the JSON transport boundary", () => {
  it("strips nested copies, arrays and toJSON output", () => {
    expect(JSON.parse(serializePublicJson(payload))).toEqual(expected);
    expect(JSON.parse(serializePublicJson({ toJSON: () => payload }))).toEqual(
      expected
    );
    expect(JSON.parse(serializePublicJson([payload]))).toEqual([expected]);
    const failure = Object.assign(new Error("internal"), {
      raw: "PRIVATE_RAW",
    });
    expect(serializePublicJson({ failure })).not.toContain("PRIVATE_RAW");
  });

  for (const native of [true, false]) {
    it(`filters action envelopes and custom JSON Responses on ${native ? "Bun native" : "Hono"}`, async () => {
      const app = await createNileServer({
        serverName: "Public JSON",
        forceNewInstance: true,
        logServices: false,
        runtime: native ? "bun" : "node",
        native,
        project: { structure: false },
        services: [
          {
            name: "sample",
            description: "Sample",
            actions: [
              {
                name: "read",
                description: "Read",
                handler: () => Ok(payload),
              },
            ],
          },
        ],
        rest: { baseUrl: "/api", allowedOrigins: [] },
      });
      const custom = () =>
        Response.json(payload, {
          headers: {
            "content-type": "application/problem+json",
            "content-length": "999",
            etag: "private-etag",
            "x-custom": "kept",
          },
        });
      const transport = app.nativeRest;
      const hono = app.rest?.app;
      if (!(transport || hono)) {
        throw new Error("Expected HTTP adapter");
      }
      if (transport) {
        transport.route("GET", "/custom", custom);
      }
      if (hono) {
        hono.get("/custom", custom);
      }
      const fetchResponse = async (request: Request) => {
        if (transport) {
          return await transport.fetch(request);
        }
        if (!hono) {
          throw new Error("Missing adapter");
        }
        return await hono.fetch(request);
      };
      try {
        const action = await fetchResponse(
          new Request("http://localhost/api/services", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              intent: "execute",
              service: "sample",
              action: "read",
              payload: {},
            }),
          })
        );
        expect((await action.json()).data).toEqual(expected);
        const response = await fetchResponse(
          new Request("http://localhost/custom")
        );
        expect(await response.json()).toEqual(expected);
        expect(response.headers.get("content-length")).toBeNull();
        expect(response.headers.get("etag")).toBeNull();
        expect(response.headers.get("x-custom")).toBe("kept");
      } finally {
        expect((await app.lifecycle.shutdown()).timedOut).toBe(false);
      }
    });
  }
});
