import { Err, Ok } from "slang-ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createValidationFailure } from "../../diagnostics/validation-failure";
import { createNileServer } from "../../nile/server";
import { handleError } from "../../utils/handle-error";

const schema = z.object({ name: z.string().min(1, "Enter a project name.") });
const CODE = /^[A-Za-z0-9_-]{12}$/;
const apps: Awaited<ReturnType<typeof createNileServer>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.lifecycle.shutdown()));
});

describe("Nile's exact message contract", () => {
  it("generates unique diagnostic references and uses the same code in the log", () => {
    const write = vi.fn(
      (_entry: { log_id?: string }) => "not-a-generated-code"
    );
    const logger = { info: write, warn: write, error: write };
    const first = handleError({
      logger,
      message: "Could not save the project.",
    });
    const second = handleError({
      logger,
      message: "Could not save the project.",
    });
    expect(first.error).not.toBe(second.error);
    const code = write.mock.calls[0]?.[0]?.log_id;
    expect(code).toMatch(CODE);
    expect(first.error).toBe(
      `Error Code: ${code} - Could not save the project.`
    );
  });

  it("uses an explicit validation message when supplied", () => {
    const parsed = schema.safeParse({ name: "" });
    if (parsed.success) {
      throw new Error("Expected an invalid fixture");
    }
    const response = createValidationFailure(
      parsed.error,
      "Choose a project name."
    );
    expect(response.message).toBe("Choose a project name.");
    expect(response.data.errorCode).toMatch(CODE);
    expect(Object.keys(response).sort()).toEqual(["data", "message", "status"]);
  });

  for (const native of [true, false]) {
    it(`preserves the exact envelope through ${native ? "Bun native" : "Hono"}`, async () => {
      const app = await createNileServer({
        serverName: "Message contract",
        runtime: native ? "bun" : "node",
        native,
        project: { structure: false },
        forceNewInstance: true,
        logServices: false,
        services: [
          {
            name: "projects",
            description: "Projects",
            actions: [
              {
                name: "create",
                description: "Create",
                validation: schema,
                handler: () => Ok({ id: "p1" }),
              },
              {
                name: "named",
                description: "Named",
                handler: () => Ok({ id: "p1" }, "Project created."),
              },
              {
                name: "refuse",
                description: "Refuse",
                handler: () => Err("This project is archived."),
              },
            ],
          },
        ],
        rest: { baseUrl: "/api", allowedOrigins: [] },
      });
      apps.push(app);
      const send = async (action: string, payload = { name: "" }) => {
        const request = new Request("http://localhost/api/services", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            intent: "execute",
            service: "projects",
            action,
            payload,
          }),
        });
        const response = app.nativeRest
          ? await app.nativeRest.fetch(request)
          : await app.rest?.app.fetch(request);
        if (!response) {
          throw new Error("Missing HTTP adapter");
        }
        const body = await response.json();
        expect(Object.keys(body).sort()).toEqual(["data", "message", "status"]);
        return body;
      };
      const parsed = schema.safeParse({ name: "" });
      if (parsed.success) {
        throw new Error("Expected validation failure");
      }
      const first = await send("create");
      const second = await send("create");
      expect(first.status).toBe(false);
      expect(first.message).toBe(z.prettifyError(parsed.error));
      expect(first.data.errorCode).toMatch(CODE);
      expect(first.data.errorCode).not.toBe(second.data.errorCode);
      expect(first.data.issues).toEqual([
        { path: "name", message: "Enter a project name." },
      ]);
      expect((await send("create", { name: "Customer portal" })).message).toBe(
        "Action completed."
      );
      expect((await send("named")).message).toBe("Project created.");
      expect((await send("refuse")).message).toBe("This project is archived.");
    });
  }
});
