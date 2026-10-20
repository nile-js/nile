import { safeTry } from "slang-ts";
import type { CorsOptions } from "@/cors/types";
import { createNativeCorsHelper } from "./cors-helper";
import { prepareNativeCorsPolicy } from "./cors-policy";
import type { NativeCorsOptions, NativeCorsRouteRule } from "./cors-types";
import { matchPath } from "./route-matcher";
import type {
  NativeRequestContext,
  NativeRestConfig,
  NativeService,
} from "./types";

type Finish = (context: NativeRequestContext) => void;
type Policy = ReturnType<typeof prepareNativeCorsPolicy>;
interface Rule {
  path: string;
  read: (context: NativeRequestContext) => Policy | Promise<Policy>;
}
interface Routing {
  intent?: string;
  service?: string;
  action?: string;
}
const finishDisabled: Finish = () => undefined;

/** The native adapter retains Nile's explicit default-deny origin policy. */
function buildDefaults(config: NativeRestConfig): NativeCorsOptions {
  const defaults = config.cors?.defaults;
  const allowed = new Set(config.allowedOrigins);
  return {
    origin:
      defaults?.origin ?? ((origin) => (allowed.has(origin) ? origin : "")),
    credentials: defaults?.credentials ?? true,
    allowHeaders: defaults?.allowHeaders ?? ["Content-Type", "Authorization"],
    allowMethods: defaults?.allowMethods ?? ["POST", "GET", "OPTIONS"],
    exposeHeaders: defaults?.exposeHeaders ?? ["Content-Length"],
    maxAge: defaults?.maxAge ?? 600,
  };
}

/** Resolve dynamic policies per request; rejected resolvers cannot grant an origin. */
function compileRule(
  rule: NativeCorsRouteRule,
  defaults: NativeCorsOptions
): Rule {
  const resolver = rule.resolver;
  if (!resolver) {
    const policy = prepareNativeCorsPolicy({ ...defaults, ...rule.options });
    return { path: rule.path, read: () => policy };
  }
  return {
    path: rule.path,
    read: async (context) => {
      const helper = createNativeCorsHelper(defaults);
      const result = await safeTry(() =>
        resolver(context.request.headers.get("origin") ?? "", context, helper)
      );
      if (result.isErr) {
        console.error("CORS resolver error:", result.error);
        helper.deny();
      }
      return prepareNativeCorsPolicy(helper.toOptions());
    },
  };
}

/** Existing static action policies are portable; Hono callbacks require an explicit native replacement. */
function migrateStaticActionCors(
  options: CorsOptions,
  service: string,
  action: string
): NativeCorsOptions {
  if (
    typeof options.origin === "function" ||
    typeof options.allowMethods === "function"
  ) {
    throw new Error(
      `Native CORS for '${service}.${action}' requires replacing Hono callbacks in cors.actions`
    );
  }
  return {
    ...options,
    origin: options.origin,
    allowMethods: options.allowMethods,
  };
}

/** Native CORS controller keeps action decisions isolated and shared preflight endpoint-level. */
export function createNativeCors({
  config,
  services,
}: {
  config: NativeRestConfig;
  services: readonly NativeService[];
}) {
  if (config.cors?.enabled === false) {
    return undefined;
  }
  const defaults = buildDefaults(config);
  const global = prepareNativeCorsPolicy(defaults);
  const rules = (config.cors?.addCors ?? [])
    .filter((rule) => rule.resolver || rule.options)
    .map((rule) => compileRule(rule, defaults));
  const servicesPath = `${config.baseUrl}/services`;
  const serviceRules = rules.filter((rule) =>
    matchPath(rule.path, servicesPath)
  );
  const inherited = (
    context: NativeRequestContext
  ): Finish | Promise<Finish> => {
    const matching =
      context.path === servicesPath
        ? serviceRules
        : rules.filter((rule) => matchPath(rule.path, context.path));
    if (!matching.length) {
      global.apply(context);
      return global.finish;
    }
    return (async () => {
      const finishes: Finish[] = [];
      for (const rule of matching) {
        const policy = await rule.read(context);
        policy.apply(context);
        finishes.push(policy.finish);
      }
      global.apply(context);
      return (current: NativeRequestContext) => {
        global.finish(current);
        for (const finish of finishes.toReversed()) {
          finish(current);
        }
      };
    })();
  };
  const policies = new Map<string, Map<string, Policy | false>>();
  for (const service of services) {
    const actions = new Map<string, Policy | false>();
    for (const action of service.actions) {
      const configured = config.cors?.actions?.[service.name]?.[action.name];
      const options = configured ?? action.cors;
      if (options === false) {
        actions.set(action.name, false);
      } else if (typeof configured === "object") {
        actions.set(
          action.name,
          prepareNativeCorsPolicy({ ...defaults, ...configured })
        );
      } else if (configured === undefined && typeof action.cors === "object") {
        actions.set(
          action.name,
          prepareNativeCorsPolicy({
            ...defaults,
            ...migrateStaticActionCors(action.cors, service.name, action.name),
          })
        );
      }
    }
    policies.set(service.name, actions);
  }
  const selected = new WeakMap<NativeRequestContext, Finish>();
  const finished = new WeakSet<NativeRequestContext>();
  const apply = (
    context: NativeRequestContext,
    policy?: Policy | false
  ): void | Promise<void> => {
    // A callback error must not retry the same callback while formatting the error response.
    selected.set(context, finishDisabled);
    if (policy === false) {
      return;
    }
    if (policy) {
      policy.apply(context);
      selected.set(context, policy.finish);
      return;
    }
    const finish = inherited(context);
    if (typeof finish === "function") {
      selected.set(context, finish);
      return;
    }
    return finish.then((resolved) => {
      selected.set(context, resolved);
    });
  };
  return {
    select: (
      context: NativeRequestContext,
      routing: Routing
    ): void | Promise<void> => {
      const policy =
        routing.intent === "execute" &&
        typeof routing.service === "string" &&
        typeof routing.action === "string"
          ? policies.get(routing.service)?.get(routing.action)
          : undefined;
      return apply(context, policy);
    },
    finish: (context: NativeRequestContext): void => {
      if (finished.has(context)) {
        return;
      }
      finished.add(context);
      selected.get(context)?.(context);
    },
    applyFallback: (context: NativeRequestContext): void | Promise<void> => {
      if (!selected.has(context)) {
        return apply(context);
      }
    },
    preflight: (
      context: NativeRequestContext
    ): Response | undefined | Promise<Response> => {
      if (context.request.method !== "OPTIONS") {
        return;
      }
      // Selection precedes callbacks so error formatting cannot retry a failed preflight policy.
      selected.set(context, finishDisabled);
      // The first matching path CORS middleware short-circuits OPTIONS before global CORS.
      const rule = rules.find((entry) => matchPath(entry.path, context.path));
      if (!rule) {
        return global.preflight(context);
      }
      const policy = rule.read(context);
      if ("then" in policy) {
        return policy.then((resolved) => resolved.preflight(context));
      }
      return policy.preflight(context);
    },
  };
}
