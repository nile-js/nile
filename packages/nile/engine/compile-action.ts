import { Ok } from "slang-ts";
import { runInActionScope } from "@/nile/request-scope";
import { authenticateAction } from "./authenticate-action";
import {
  processHooks,
  runGlobalAfterHook,
  runGlobalBeforeHook,
  runHandler,
  validatePayload,
} from "./pipeline";
import type { Action, Engine, EngineOptions } from "./types";

type ActionExecutor = (
  payload: Parameters<Engine["executeAction"]>[2],
  context: Parameters<Engine["executeAction"]>[3]
) => ReturnType<Engine["executeAction"]>;

/** Bind action identity once while reading mutable phase definitions at their original execution points. */
export function compileActionExecutor({
  action,
  serviceName,
  options,
  getAction,
  log,
}: {
  action: Action;
  serviceName: string;
  options: EngineOptions;
  getAction: Engine["getAction"];
  log: Parameters<typeof runHandler>[3];
}): ActionExecutor {
  const actionName = action.name;
  const qualifiedName = `${serviceName}.${actionName}`;
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: fixed phase order and live phase reads preserve mutable action definitions
  const execute: ActionExecutor = async (payload, nileContext) => {
    const { onBeforeActionHandler, onAfterActionHandler } = options;

    // Skip only absent phases; configured callbacks still run in the existing order.
    const auth = options.auth;
    if (action.isProtected && auth) {
      const authStep = await authenticateAction(
        action,
        auth,
        nileContext,
        serviceName,
        actionName,
        log
      );
      if (authStep.isErr) {
        return authStep;
      }
    }

    if (onBeforeActionHandler) {
      const globalBeforeResult = await runGlobalBeforeHook(
        onBeforeActionHandler,
        nileContext,
        action,
        payload,
        log
      );
      if (globalBeforeResult.isErr) {
        return globalBeforeResult;
      }
    }

    let validatedPayload = payload;
    if (options.checkQuota) {
      const quota = await options.checkQuota(serviceName, actionName);
      if (quota.isErr) {
        return quota;
      }
    }
    const beforeHooks = action.hooks?.before;
    if (beforeHooks?.length) {
      const beforeHooksResult = await processHooks(
        beforeHooks,
        validatedPayload,
        getAction,
        nileContext,
        "before",
        log
      );
      if (beforeHooksResult.isErr) {
        return beforeHooksResult;
      }
      validatedPayload = beforeHooksResult.value;
    }

    if (action.validation) {
      const validationResult = validatePayload(
        action,
        validatedPayload,
        nileContext,
        log
      );
      if (validationResult.isErr) {
        return validationResult;
      }
      validatedPayload = validationResult.value;
    }

    // Handler crash safety and isolated hook state apply even when no optional phases exist.
    const handlerResult = await runHandler(
      action,
      validatedPayload,
      nileContext,
      log
    );
    if (handlerResult.isErr) {
      return handlerResult;
    }

    let outputResult = handlerResult;
    let output = handlerResult.value;
    const afterHooks = action.hooks?.after;
    if (afterHooks?.length) {
      const afterHooksResult = await processHooks(
        afterHooks,
        output,
        getAction,
        nileContext,
        "after",
        log
      );
      if (afterHooksResult.isErr) {
        return afterHooksResult;
      }
      outputResult = afterHooksResult;
      output = afterHooksResult.value;
    }

    if (onAfterActionHandler) {
      const globalAfterResult = await runGlobalAfterHook(
        onAfterActionHandler,
        nileContext,
        action,
        validatedPayload,
        output,
        log
      );
      if (globalAfterResult.isErr) {
        return globalAfterResult;
      }
      outputResult = globalAfterResult;
      output = globalAfterResult.value;
    }

    return action.result?.pipeline
      ? Ok({ data: output, pipeline: nileContext.hookContext.log })
      : outputResult;
  };

  return (payload, nileContext) =>
    runInActionScope({
      actionName: qualifiedName,
      input: payload,
      fn: () => execute(payload, nileContext),
    });
}
