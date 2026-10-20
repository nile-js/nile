import type {
  NativeFormBody,
  NativeRequestContext,
  NativeStateValue,
} from "./types";

/** Parse multipart once, retaining repeated fields and the existing bracket-key convention. */
async function parseBody(request: Request): Promise<NativeFormBody> {
  const form = await request.formData();
  const body: NativeFormBody = Object.create(null);
  form.forEach((value, key) => {
    const current = body[key];
    if (current === undefined) {
      body[key] = key.endsWith("[]") ? [value] : value;
    } else {
      body[key] = Array.isArray(current)
        ? [...current, value]
        : [current, value];
    }
  });
  return body;
}

/** Create a native transport context with cached multipart parsing and real Fetch responses. */
export function createNativeRequestContext(
  request: Request,
  params: Record<string, string> = {}
): NativeRequestContext {
  const pendingHeaders = new Headers();
  const state = new Map<string, NativeStateValue>();
  let parsedBody: Promise<NativeFormBody> | undefined;
  let response: Response | undefined;
  const context: NativeRequestContext = {
    request,
    path: new URL(request.url).pathname,
    params,
    state,
    get headers() {
      return response?.headers ?? pendingHeaders;
    },
    get response() {
      return response;
    },
    set response(value) {
      if (value) {
        context.respond(value);
      } else {
        response = undefined;
      }
    },
    setHeader: (name, value) => {
      context.headers.set(name, value);
    },
    get: <T extends NativeStateValue>(key: string) =>
      state.get(key) as T | undefined,
    set: (key, value) => {
      state.set(key, value);
    },
    json: (body, status = 200) => {
      const headers = new Headers(context.headers);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
      response = Response.json(body, { status, headers });
      return response;
    },
    text: (body, status = 200) => {
      const headers = new Headers(context.headers);
      if (!headers.has("content-type")) {
        headers.set("content-type", "text/plain; charset=UTF-8");
      }
      response = new Response(body, { status, headers });
      return response;
    },
    respond: (value) => {
      if (value === response) {
        return value;
      }
      const headers = new Headers(value.headers);
      context.headers.forEach((value, key) => {
        if (key !== "set-cookie" && !headers.has(key)) {
          headers.set(key, value);
        }
      });
      const cookies = new Set(headers.getSetCookie());
      for (const cookie of context.headers.getSetCookie()) {
        if (!cookies.has(cookie)) {
          headers.append("Set-Cookie", cookie);
        }
      }
      response = new Response(value.body, {
        status: value.status,
        statusText: value.statusText,
        headers,
      });
      return response;
    },
    parseBody: () => {
      parsedBody ??= parseBody(request);
      return parsedBody;
    },
  };
  return context;
}
