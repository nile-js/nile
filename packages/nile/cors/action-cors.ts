import type { Context, MiddlewareHandler } from "hono";
import { TrieRouter } from "hono/router/trie-router";
import { safeTry } from "slang-ts";
import type { Engine } from "@/engine/types";
import type { ExternalRequest } from "@/nile/types";
import type { RestConfig } from "@/rest/types";
import { type CompiledCorsPolicy, prepareCorsPolicy } from "./compile-policy";
import { buildDefaultCorsOptions, createCorsHelper } from "./cors";
import type { CorsOptions, CorsRouteRule } from "./types";

type ResponsePolicy = (
  context: Context
) => CompiledCorsPolicy | Promise<CompiledCorsPolicy>;

/** Apply headers before execution and leave Vary for middleware unwinding. */
function compileResponsePolicy(
  options: CorsOptions
): (context: Context) => CompiledCorsPolicy {
  const policy = prepareCorsPolicy(options);
  return (context) => {
    policy.apply(context);
    return policy.finish;
  };
}
type Routing = Partial<Pick<ExternalRequest, "intent" | "service" | "action">>;

export interface ActionCors {
  path: string;
  middleware: MiddlewareHandler;
  select: (context: Context, routing: Routing) => void | Promise<void>;
}

/** Compile a legacy path rule without invoking request-dependent resolvers at startup. */
function compileRouteRule(
  rule: CorsRouteRule,
  defaults: CorsOptions
): ResponsePolicy {
  const resolver = rule.resolver;
  if (!resolver) {
    return compileResponsePolicy({ ...defaults, ...rule.options });
  }
  return async (context) => {
    const helper = createCorsHelper(defaults);
    const result = await safeTry(() =>
      resolver(context.req.header("Origin") ?? "", context, helper)
    );
    if (result.isErr) {
      console.error("CORS resolver error:", result.error);
      helper.deny();
    }
    return compileResponsePolicy(helper.toOptions())(context);
  };
}

/** Preserve matching path policies followed by the global policy for inherited actions. */
function compileInheritedPolicy(
  config: RestConfig,
  path: string,
  defaults: CorsOptions
): ResponsePolicy {
  const globalPolicy = compileResponsePolicy(defaults);
  const rules =
    config.cors?.addCors?.filter((rule) => rule.resolver || rule.options) ?? [];
  if (rules.length === 0) {
    return globalPolicy;
  }
  const router = new TrieRouter<ResponsePolicy>();
  for (const rule of rules) {
    router.add("POST", rule.path, compileRouteRule(rule, defaults));
  }
  const policies = router.match("POST", path)[0].map(([policy]) => policy);
  if (policies.length === 0) {
    return globalPolicy;
  }
  return async (context) => {
    const finishes: CompiledCorsPolicy[] = [];
    for (const policy of policies) {
      finishes.push(await policy(context));
    }
    const finishGlobal = globalPolicy(context);
    return (current) => {
      finishGlobal(current);
      for (const finish of finishes.toReversed()) {
        finish(current);
      }
    };
  };
}

/** Compile action policies once; keep selection isolated to each Hono request. */
export function createActionCors(
  config: RestConfig,
  engine: Engine,
  path: string
): ActionCors | undefined {
  if (config.cors?.enabled === false) {
    return undefined;
  }
  const defaults = buildDefaultCorsOptions(config);
  const inherited = compileInheritedPolicy(config, path, defaults);
  const finishDisabled: CompiledCorsPolicy = () => undefined;
  const disabled: ResponsePolicy = () => finishDisabled;
  const policies = new Map<string, Map<string, ResponsePolicy>>();
  const services = engine.getServices();
  if (services.isErr) {
    throw new Error(`Cannot compile action CORS policies: ${services.error}`);
  }
  for (const service of services.value) {
    const actions = new Map<string, ResponsePolicy>();
    for (const name of service.actions) {
      const action = engine.getAction(service.name, name);
      if (action.isErr) {
        throw new Error(`Cannot compile action CORS policy: ${action.error}`);
      }
      const options = action.value.cors;
      let policy = inherited;
      if (options === false) {
        policy = disabled;
      } else if (typeof options === "object") {
        policy = compileResponsePolicy({ ...defaults, ...options });
      }
      actions.set(name, policy);
    }
    policies.set(service.name, actions);
  }
  const selected = new WeakMap<Context, CompiledCorsPolicy>();
  return {
    path,
    select: (context, routing) => {
      const policy =
        routing.intent === "execute" &&
        typeof routing.service === "string" &&
        typeof routing.action === "string"
          ? (policies.get(routing.service)?.get(routing.action) ?? inherited)
          : inherited;
      // Mark selection before callbacks so a thrown callback is not retried on the error response.
      selected.set(context, finishDisabled);
      const finish = policy(context);
      if (typeof finish === "function") {
        selected.set(context, finish);
        return;
      }
      return finish.then((resolved) => {
        selected.set(context, resolved);
      });
    },
    middleware: async (context, next) => {
      await next();
      const finish = selected.get(context);
      if (finish) {
        return finish(context);
      }
      // Early middleware responses and unparseable bodies have no selected action.
      const fallback = inherited(context);
      if (typeof fallback === "function") {
        fallback(context);
      } else {
        (await fallback)(context);
      }
    },
  };
}
