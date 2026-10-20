import { safeTry } from "slang-ts";
import z from "zod";
import type { Engine } from "../engine/types";
import type { ExternalRequest, NileContext } from "../nile/types";
import {
  enforceActionContentType,
  type FormDataResult,
  parseFormDataFlat,
  type UploadsConfig,
  validateFiles,
} from "../rest/uploads";
import {
  checkNativeDiscoveryAccess,
  type createNativeIntentHandlers,
} from "./discovery";
import type { NativeRequestContext, NativeRestConfig } from "./types";

const routingSchema = z.object({
  intent: z.enum(["explore", "execute", "schema"]),
  service: z.string().min(1),
  action: z.string().min(1),
});

/** Reuse the pure parser while preserving legacy routing-field retention. */
function createPayloadForm(
  body: Awaited<ReturnType<NativeRequestContext["parseBody"]>>
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) {
    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      form.append(key, entry);
    }
  }
  return form;
}

/** Preserve legacy parsing rules and validate actual files through the shared validators. */
function readUploadPayload(
  body: Awaited<ReturnType<NativeRequestContext["parseBody"]>>,
  config: UploadsConfig
): FormDataResult {
  // The existing upload entry point ignores uploadMode and rejects mixed keys in both modes.
  const parsed = parseFormDataFlat(createPayloadForm(body));
  if (!(parsed.status && parsed.data)) {
    return parsed;
  }
  // Explicit [] keys remain arrays even with one entry in the legacy all-values parser.
  for (const [key, value] of Object.entries(body)) {
    if (!Array.isArray(value) || key === "action") {
      continue;
    }
    const field = parsed.data.fields[key];
    const file = parsed.data.files[key];
    if (typeof field === "string") {
      parsed.data.fields[key] = [field];
    }
    if (file instanceof File) {
      parsed.data.files[key] = [file];
    }
  }
  const files = Object.values(parsed.data.files).flatMap((value) =>
    Array.isArray(value) ? value : [value]
  );
  const validation = validateFiles(files, config);
  if (!validation.status) {
    return {
      status: false,
      message: validation.message,
      errorData: validation.data,
      statusCode: validation.statusCode,
    };
  }
  return parsed;
}

/** Parse native multipart requests while retaining Nile's real validation and action pipeline. */
export async function handleNativeFormData({
  context,
  config,
  engine,
  nileContext,
  handlers,
  selectCors,
}: {
  context: NativeRequestContext;
  config: NativeRestConfig;
  engine: Engine;
  nileContext: NileContext;
  handlers: ReturnType<typeof createNativeIntentHandlers>;
  selectCors?: (
    context: NativeRequestContext,
    request: Pick<ExternalRequest, "intent" | "service" | "action">
  ) => void | Promise<void>;
}): Promise<Response> {
  const rawResult = await safeTry(() => context.parseBody());
  if (rawResult.isErr) {
    return context.json(
      {
        status: false,
        message: "Failed to parse multipart form data",
        data: {},
      },
      400
    );
  }
  const body = rawResult.value;
  const routing = routingSchema.safeParse({
    intent: body.intent,
    service: body.service,
    action: body.action,
  });
  if (!routing.success) {
    return context.json(
      {
        status: false,
        message:
          "Form-data must include 'intent', 'service', and 'action' fields",
        data: { errors: routing.error.issues },
      },
      400
    );
  }
  await selectCors?.(context, routing.data);
  const discovery = checkNativeDiscoveryAccess(
    routing.data.intent,
    body,
    config
  );
  if (!discovery.allowed) {
    return context.json(
      { status: false, message: discovery.message ?? "Forbidden", data: {} },
      403
    );
  }
  const actionResult = engine.getAction(
    routing.data.service,
    routing.data.action
  );
  if (actionResult.isOk && config.uploads?.enforceContentType) {
    const content = enforceActionContentType(
      actionResult.value,
      "multipart/form-data",
      true
    );
    if (!content.status) {
      return context.json(
        {
          status: false,
          message: content.message ?? "Unsupported content type",
          data: content.data ?? {},
        },
        content.statusCode ?? 415
      );
    }
  }
  const parsed = readUploadPayload(body, config.uploads ?? {});
  if (!(parsed.status && parsed.data)) {
    return context.json(
      {
        status: false,
        message: parsed.message ?? "Upload validation failed",
        data: parsed.errorData ?? {},
      },
      parsed.statusCode ?? 400
    );
  }
  const request: ExternalRequest = {
    ...routing.data,
    payload: { fields: parsed.data.fields, files: parsed.data.files },
  };
  const response = await handlers[request.intent](engine, request, nileContext);
  return context.json(response, response.status ? 200 : 400);
}
