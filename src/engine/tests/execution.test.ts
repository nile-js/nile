import { Err, Ok } from "slang-ts";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createNileContext } from "../../nile/nile";
import { createEngine } from "../engine";
import type { Service } from "../types";

describe("executeAction - Basic Execution", () => {
  const nileContext = createNileContext();

  it("should execute a simple action and return Ok with result", async () => {
    const services: Service[] = [
      {
        name: "math",
        description: "Math service",
        actions: [
          {
            name: "add",
            description: "Add two numbers",
            handler: (data) => Ok((data.a as number) + (data.b as number)),
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "math",
      "add",
      { a: 2, b: 3 },
      nileContext
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toBe(5);
    }
  });

  it("should return Err when service does not exist", async () => {
    const engine = createEngine({ services: [] });
    const result = await engine.executeAction(
      "unknown",
      "action",
      {},
      nileContext
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("Service 'unknown' not found");
    }
  });

  it("should return Err when action does not exist", async () => {
    const services: Service[] = [
      {
        name: "test",
        description: "Test service",
        actions: [],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "test",
      "missing",
      {},
      nileContext
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("Action 'missing' not found");
    }
  });

  it("should return Err when handler fails", async () => {
    const services: Service[] = [
      {
        name: "errors",
        description: "Error testing service",
        actions: [
          {
            name: "fail",
            description: "Always fails",
            handler: () => Err("Something went wrong"),
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "errors",
      "fail",
      {},
      nileContext
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe("Something went wrong");
    }
  });
});

describe("executeAction - Validation", () => {
  const nileContext = createNileContext();
  const services: Service[] = [
    {
      name: "users",
      description: "User service",
      actions: [
        {
          name: "create",
          description: "Create user",
          handler: (data) => Ok({ id: 1, name: data.name }),
          validation: z.object({
            name: z.string().min(2),
            email: z.string().email(),
          }),
          accessControl: ["admin"],
        },
        {
          name: "noValidation",
          description: "Action without validation",
          handler: (data) => Ok(data),
          accessControl: ["public"],
        },
      ],
    },
  ];

  it("should pass validation with valid payload", async () => {
    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "users",
      "create",
      {
        name: "John",
        email: "john@example.com",
      },
      nileContext
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual({ id: 1, name: "John" });
    }
  });

  it("should return Err with validation error for invalid payload", async () => {
    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "users",
      "create",
      {
        name: "J", // too short
        email: "not-an-email",
      },
      nileContext
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("Validation failed");
    }
  });

  it("should skip validation when no schema defined", async () => {
    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "users",
      "noValidation",
      {
        anything: "goes",
      },
      nileContext
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual({ anything: "goes" });
    }
  });
});

describe("executeAction - Before/After Hooks", () => {
  const nileContext = createNileContext();
  it("should run before hooks and mutate payload", async () => {
    const services: Service[] = [
      {
        name: "hooks",
        description: "Hook testing",
        actions: [
          {
            name: "addTimestamp",
            description: "Adds timestamp to payload",
            handler: (data) => Ok({ ...data, timestamp: 12_345 }),
            accessControl: ["system"],
          },
          {
            name: "process",
            description: "Process data",
            handler: (data) => Ok(data),
            hooks: {
              before: [
                { service: "hooks", action: "addTimestamp", isCritical: true },
              ],
            },
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "hooks",
      "process",
      { value: 1 },
      nileContext
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual({ value: 1, timestamp: 12_345 });
    }
  });

  it("should run after hooks and mutate result", async () => {
    const services: Service[] = [
      {
        name: "hooks",
        description: "Hook testing",
        actions: [
          {
            name: "wrapResult",
            description: "Wraps result in envelope",
            handler: (data) => Ok({ wrapped: true, original: data }),
            accessControl: ["system"],
          },
          {
            name: "getData",
            description: "Get data",
            handler: () => Ok({ data: "test" }),
            hooks: {
              after: [
                { service: "hooks", action: "wrapResult", isCritical: true },
              ],
            },
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "hooks",
      "getData",
      {},
      nileContext
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toHaveProperty("wrapped", true);
      expect(result.value).toHaveProperty("original");
    }
  });

  it("should fail execution when isCritical hook fails", async () => {
    const services: Service[] = [
      {
        name: "hooks",
        description: "Hook testing",
        actions: [
          {
            name: "failingHook",
            description: "Always fails",
            handler: () => Err("Hook failed"),
            accessControl: ["system"],
          },
          {
            name: "protected",
            description: "Protected action",
            handler: () => Ok("success"),
            hooks: {
              before: [
                { service: "hooks", action: "failingHook", isCritical: true },
              ],
            },
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "hooks",
      "protected",
      {},
      nileContext
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe("Hook failed");
    }
  });

  it("should continue execution when isCritical=false hook fails", async () => {
    const services: Service[] = [
      {
        name: "hooks",
        description: "Hook testing",
        actions: [
          {
            name: "optionalHook",
            description: "Optional hook that fails",
            handler: () => Err("Optional hook failed"),
            accessControl: ["system"],
          },
          {
            name: "resilient",
            description: "Resilient action",
            handler: () => Ok("success despite hook failure"),
            hooks: {
              before: [
                { service: "hooks", action: "optionalHook", isCritical: false },
              ],
            },
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "hooks",
      "resilient",
      {},
      nileContext
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toBe("success despite hook failure");
    }
  });

  it("should skip hook when hook action not found and isCritical=false", async () => {
    const services: Service[] = [
      {
        name: "hooks",
        description: "Hook testing",
        actions: [
          {
            name: "withMissingHook",
            description: "Action with missing hook",
            handler: () => Ok("executed"),
            hooks: {
              before: [
                { service: "nonexistent", action: "hook", isCritical: false },
              ],
            },
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "hooks",
      "withMissingHook",
      {},
      nileContext
    );

    expect(result.isOk).toBe(true);
  });

  it("should fail when hook action not found and isCritical=true", async () => {
    const services: Service[] = [
      {
        name: "hooks",
        description: "Hook testing",
        actions: [
          {
            name: "withMissingRequiredHook",
            description: "Action with missing required hook",
            handler: () => Ok("executed"),
            hooks: {
              before: [
                { service: "nonexistent", action: "hook", isCritical: true },
              ],
            },
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "hooks",
      "withMissingRequiredHook",
      {},
      nileContext
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("not found");
    }
  });
});

describe("executeAction - Global Hooks", () => {
  it("should run global before hook and fail if it returns Err", async () => {
    const services: Service[] = [
      {
        name: "test",
        description: "Test service",
        actions: [
          {
            name: "action",
            description: "Test action",
            handler: () => Ok("success"),
            accessControl: ["public"],
          },
        ],
      },
    ];

    const nileContext = createNileContext();
    const onBeforeActionHandler = vi.fn().mockReturnValue(Err("Access denied"));

    const engine = createEngine({
      services,
      onBeforeActionHandler,
    });
    const result = await engine.executeAction(
      "test",
      "action",
      {},
      nileContext
    );

    expect(onBeforeActionHandler).toHaveBeenCalled();
    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toBe("Access denied");
    }
  });

  it("should run global before hook and continue if it returns Ok", async () => {
    const services: Service[] = [
      {
        name: "test",
        description: "Test service",
        actions: [
          {
            name: "action",
            description: "Test action",
            handler: () => Ok("handler result"),
            accessControl: ["public"],
          },
        ],
      },
    ];

    const nileContext = createNileContext();
    const onBeforeActionHandler = vi.fn().mockReturnValue(Ok(true));

    const engine = createEngine({
      services,
      onBeforeActionHandler,
    });
    const result = await engine.executeAction(
      "test",
      "action",
      {},
      nileContext
    );

    expect(onBeforeActionHandler).toHaveBeenCalled();
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toBe("handler result");
    }
  });

  it("should run global after hook and transform result", async () => {
    const services: Service[] = [
      {
        name: "test",
        description: "Test service",
        actions: [
          {
            name: "action",
            description: "Test action",
            handler: () => Ok({ original: true }),
            accessControl: ["public"],
          },
        ],
      },
    ];

    const nileContext = createNileContext();
    const onAfterActionHandler = vi
      .fn()
      .mockReturnValue(Ok({ transformed: true }));

    const engine = createEngine({
      services,
      onAfterActionHandler,
    });
    const result = await engine.executeAction(
      "test",
      "action",
      {},
      nileContext
    );

    expect(onAfterActionHandler).toHaveBeenCalled();
    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual({ transformed: true });
    }
  });

  it("should have hookContext in nileContext", async () => {
    const services: Service[] = [
      {
        name: "test",
        description: "Test service",
        actions: [
          {
            name: "action",
            description: "Test action",
            handler: () => Ok("success"),
            accessControl: ["public"],
          },
        ],
      },
    ];

    const nileContext = createNileContext();
    const onBeforeActionHandler = vi.fn(({ nileContext: ctx }) => {
      expect(ctx.hookContext).toBeDefined();
      expect(ctx.hookContext.actionName).toBe("test.action");
      return Ok(true);
    });

    const engine = createEngine({
      services,
      onBeforeActionHandler,
    });
    await engine.executeAction(
      "test",
      "action",
      { input: "data" },
      nileContext
    );

    expect(onBeforeActionHandler).toHaveBeenCalled();
  });
});

describe("executeAction - Crash Safety (safeTry)", () => {
  const nileContext = createNileContext();

  it("should catch handler that throws and return Err", async () => {
    const services: Service[] = [
      {
        name: "unsafe",
        description: "Unsafe service",
        actions: [
          {
            name: "explode",
            description: "Throws instead of returning Result",
            handler: () => {
              throw new Error("Unexpected crash in handler");
            },
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "unsafe",
      "explode",
      {},
      nileContext
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("Unexpected crash in handler");
    }
  });

  it("should catch throwing before hook and respect isCritical", async () => {
    const services: Service[] = [
      {
        name: "unsafe",
        description: "Unsafe service",
        actions: [
          {
            name: "throwingHook",
            description: "Hook that throws",
            handler: () => {
              throw new Error("Hook exploded");
            },
            accessControl: ["system"],
          },
          {
            name: "guarded",
            description: "Guarded action",
            handler: () => Ok("should not reach"),
            hooks: {
              before: [
                { service: "unsafe", action: "throwingHook", isCritical: true },
              ],
            },
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "unsafe",
      "guarded",
      {},
      nileContext
    );

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("Hook exploded");
    }
  });

  it("should catch throwing global before hook and return Err", async () => {
    const services: Service[] = [
      {
        name: "test",
        description: "Test service",
        actions: [
          {
            name: "action",
            description: "Test action",
            handler: () => Ok("success"),
            accessControl: ["public"],
          },
        ],
      },
    ];

    const ctx = createNileContext();
    const onBeforeActionHandler = () => {
      throw new Error("Global before hook crashed");
    };

    const engine = createEngine({
      services,
      onBeforeActionHandler: onBeforeActionHandler as never,
    });
    const result = await engine.executeAction("test", "action", {}, ctx);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("Global before hook crashed");
    }
  });

  it("should catch throwing global after hook and return Err", async () => {
    const services: Service[] = [
      {
        name: "test",
        description: "Test service",
        actions: [
          {
            name: "action",
            description: "Test action",
            handler: () => Ok("success"),
            accessControl: ["public"],
          },
        ],
      },
    ];

    const ctx = createNileContext();
    const onAfterActionHandler = () => {
      throw new Error("Global after hook crashed");
    };

    const engine = createEngine({
      services,
      onAfterActionHandler: onAfterActionHandler as never,
    });
    const result = await engine.executeAction("test", "action", {}, ctx);

    expect(result.isErr).toBe(true);
    if (result.isErr) {
      expect(result.error).toContain("Global after hook crashed");
    }
  });

  it("should continue when non-critical hook throws (isCritical=false)", async () => {
    const services: Service[] = [
      {
        name: "unsafe",
        description: "Unsafe service",
        actions: [
          {
            name: "throwingHook",
            description: "Hook that throws",
            handler: () => {
              throw new Error("Non-critical crash");
            },
            accessControl: ["system"],
          },
          {
            name: "resilient",
            description: "Resilient action",
            handler: () => Ok("still works"),
            hooks: {
              before: [
                {
                  service: "unsafe",
                  action: "throwingHook",
                  isCritical: false,
                },
              ],
            },
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "unsafe",
      "resilient",
      {},
      nileContext
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toBe("still works");
    }
  });
});

describe("executeAction - Pipeline Response Mode", () => {
  const nileContext = createNileContext();
  it("should return pipeline log when action.result.pipeline is true", async () => {
    const services: Service[] = [
      {
        name: "pipeline",
        description: "Pipeline testing",
        actions: [
          {
            name: "logHook",
            description: "Logging hook",
            handler: (data) => Ok({ ...data, logged: true }),
            accessControl: ["system"],
          },
          {
            name: "withPipeline",
            description: "Action with pipeline response",
            handler: () => Ok({ result: "data" }),
            hooks: {
              before: [
                { service: "pipeline", action: "logHook", isCritical: false },
              ],
            },
            result: { pipeline: true },
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "pipeline",
      "withPipeline",
      { initial: true },
      nileContext
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      const value = result.value as {
        data: unknown;
        pipeline: { before: unknown[]; after: unknown[] };
      };
      expect(value).toHaveProperty("data");
      expect(value).toHaveProperty("pipeline");
      expect(value.pipeline).toHaveProperty("before");
      expect(value.pipeline).toHaveProperty("after");
      expect(Array.isArray(value.pipeline.before)).toBe(true);
    }
  });

  it("should not include pipeline log when action.result.pipeline is false/undefined", async () => {
    const services: Service[] = [
      {
        name: "normal",
        description: "Normal action",
        actions: [
          {
            name: "standard",
            description: "Standard action",
            handler: () => Ok({ result: "data" }),
            accessControl: ["public"],
          },
        ],
      },
    ];

    const engine = createEngine({ services });
    const result = await engine.executeAction(
      "normal",
      "standard",
      {},
      nileContext
    );

    expect(result.isOk).toBe(true);
    if (result.isOk) {
      expect(result.value).toEqual({ result: "data" });
      expect(result.value).not.toHaveProperty("pipeline");
    }
  });
});
