import { Err, Ok, type Result, safeTry } from "slang-ts";
import type { Socket } from "socket.io";
import { Server } from "socket.io";
import z from "zod";
import { createRateLimiter } from "../controls/rate-limit";
import type { Engine } from "../engine/types";
import type { NileLifecycle } from "../lifecycle/types";
import { createTopicMessaging } from "../messaging/messaging";
import { createTopicSchemaReader } from "../messaging/schema";
import { publicationSchema, selectionSchema } from "../messaging/validation";
import { runInRequestScope } from "../nile/request-scope";
import type { NileContext } from "../nile/types";
import { checkSocketPolicy, invokeSocketAction } from "./socket-actions";
import { createBunSocketInterface } from "./socket-bun";
import { resolveSocketLimits } from "./socket-limits";
import { createNodeSocketAttachment } from "./socket-node";
import type { NileSocket, SocketConfig } from "./socket-types";
import type { WebSocketIdentity } from "./types";

type Ack = (result: {
  error: string | null;
  data: z.output<z.ZodType>;
}) => void;

const TRAILING_SLASH = /\/$/;

/** Own one Socket.IO server per Nile instance; HTTP and sockets share engine and lifecycle. */
export async function createSocketTransport({
  config,
  engine,
  context,
  lifecycle,
  runtime,
}: {
  config: SocketConfig;
  engine: Engine;
  context: NileContext;
  lifecycle: NileLifecycle;
  runtime: "bun" | "node";
}): Promise<NileSocket> {
  const path = config.path ?? "/socket.io";
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) {
    throw new Error("Socket path must be an absolute URL path");
  }
  const bounds = resolveSocketLimits(config);
  const topics = createTopicMessaging(config.topics ?? {});
  const io = new Server({
    path,
    maxHttpBufferSize: bounds.bytes,
    connectTimeout: bounds.authMs,
    serveClient: false,
    cors: { origin: config.allowedOrigins ?? [], credentials: true },
    allowRequest: (request, done) =>
      done(
        null,
        !request.headers.origin ||
          (config.allowedOrigins ?? []).includes(request.headers.origin)
      ),
  });
  const BunEngine =
    runtime === "bun"
      ? (await import("@socket.io/bun-engine")).Server
      : undefined;
  const bunEngine = BunEngine
    ? new BunEngine({
        path: `${path.replace(TRAILING_SLASH, "")}/`,
        maxHttpBufferSize: bounds.bytes,
        cors: { origin: config.allowedOrigins ?? [], credentials: true },
        allowRequest: (request) => {
          const origin = request.headers.get("origin");
          if (origin && !(config.allowedOrigins ?? []).includes(origin)) {
            return Promise.reject(new Error("Origin denied"));
          }
          return Promise.resolve();
        },
      })
    : undefined;
  if (bunEngine) {
    io.bind(bunEngine);
  }
  const identities = new Map<
    string,
    { identity: WebSocketIdentity; request: Request }
  >();
  const quota = createRateLimiter({
    strategy: "fixed-window",
    limit: bounds.perMinute,
    windowMs: 60_000,
    maxKeys: bounds.connections,
  });
  let accepting = true;
  let pendingAuth = 0;
  const nodeAttachment = createNodeSocketAttachment(
    io,
    path,
    Boolean(bunEngine)
  );
  io.use((socket, next) => {
    if (
      !(accepting && lifecycle.isReady()) ||
      identities.size + pendingAuth >= bounds.connections
    ) {
      next(new Error("Socket unavailable"));
      return;
    }
    pendingAuth++;
    const request =
      socket.request instanceof Request
        ? socket.request
        : new Request(`http://localhost${socket.request.url ?? path}`, {
            headers: Object.fromEntries(
              Object.entries(socket.handshake.headers).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string"
              )
            ),
          });
    let timer: ReturnType<typeof setTimeout>;
    const authenticated = safeTry(() =>
      config.authenticate
        ? config.authenticate(
            request,
            z.record(z.string(), z.string()).parse(socket.handshake.auth)
          )
        : Ok<WebSocketIdentity>({})
    );
    // Retain the capacity reservation until the actual callback settles, even after timeout.
    authenticated.then(() => {
      pendingAuth--;
    });
    Promise.race([
      authenticated,
      new Promise<ReturnType<typeof Err>>((resolve) => {
        timer = setTimeout(
          () => resolve(Err("Authentication timed out")),
          bounds.authMs
        );
      }),
    ]).then((result) => {
      clearTimeout(timer);
      if (
        result.isErr ||
        !accepting ||
        (!socket.connected && socket.conn.readyState !== "open")
      ) {
        next(new Error("Authentication failed"));
        return;
      }
      identities.set(socket.id, { identity: result.value, request });
      next();
    });
  });
  io.on("connection", (socket: Socket) => {
    const entry = identities.get(socket.id);
    if (!entry) {
      socket.disconnect(true);
      return;
    }
    const controller = new AbortController();
    const subscriptions = new Map<string, () => void>();
    let active = 0;
    let bufferedBytes = 0;
    socket.conn.on("packetCreate", (packet) => {
      bufferedBytes +=
        typeof packet.data === "string"
          ? new TextEncoder().encode(packet.data).byteLength
          : bounds.bytes;
      if (bufferedBytes > bounds.buffered) {
        socket.disconnect(true);
      }
    });
    socket.conn.on("drain", () => {
      bufferedBytes = 0;
    });
    const alive = () =>
      !controller.signal.aborted &&
      (entry.identity.expiresAt === undefined ||
        entry.identity.expiresAt > Date.now());
    const deliver = (message: z.output<z.ZodType>) => {
      if (!alive()) {
        socket.disconnect(true);
        return;
      }
      const size = new TextEncoder().encode(JSON.stringify(message)).byteLength;
      if (bufferedBytes + size > bounds.buffered) {
        socket.disconnect(true);
        return;
      }
      socket.emit("nile:message", message);
    };
    const handle = (
      name: string,
      fn: (
        input: z.input<z.ZodType>
      ) => Promise<Result<z.output<z.ZodType>, string>>
    ) => {
      socket.on(name, (input: z.input<z.ZodType>, ack: Ack) => {
        if (typeof ack !== "function") {
          return;
        }
        const allowance = quota.consume({ key: socket.id });
        if (
          !(accepting && alive()) ||
          active >= bounds.concurrent ||
          allowance.isErr ||
          !allowance.value.allowed
        ) {
          ack({ error: "Socket unavailable or limit exceeded", data: null });
          return;
        }
        const admission = lifecycle.enter(controller.signal);
        if (admission.isErr) {
          ack({ error: "Server is draining", data: null });
          return;
        }
        active++;
        safeTry(() => fn(input)).then((result) => {
          active--;
          admission.value.finish();
          if (controller.signal.aborted) {
            return;
          }
          safeTry(() =>
            ack({
              error: result.isErr ? String(result.error) : null,
              data: result.isOk ? result.value : null,
            })
          );
        });
      });
    };
    const authorize = async (
      input: z.input<typeof selectionSchema>,
      publish: boolean
    ) => {
      const selection = await topics.validate(input);
      if (selection.isErr) {
        return selection;
      }
      const policy = publish
        ? config.authorizePublish
        : config.authorizeSubscription;
      const allowed = await checkSocketPolicy(
        policy
          ? () =>
              runInRequestScope(
                {
                  context,
                  sessions: { ws: { ...entry.identity.session } },
                  ws: { connection: socket.id },
                },
                () =>
                  policy({
                    topic: input.topic,
                    scope: selection.value.scope,
                    identity: entry.identity,
                    context,
                  })
              )
          : undefined
      );
      return allowed.isErr ? allowed : selection;
    };
    handle("nile:invoke", (input) =>
      invokeSocketAction({
        engine,
        context,
        identity: entry.identity,
        signal: controller.signal,
        request: entry.request,
        input,
        connection: socket.id,
      })
    );
    handle("nile:send", async (input) => {
      const parsed = publicationSchema.safeParse(input);
      if (!parsed.success) {
        return Err("Invalid topic message");
      }
      const allowed = await authorize(parsed.data, true);
      if (allowed.isErr) {
        return allowed;
      }
      if (!alive()) {
        return Err("Socket disconnected");
      }
      return topics.send(parsed.data);
    });
    const releaseSubscription = (
      key: string,
      unsubscribe: () => void,
      scope: z.output<ReturnType<typeof z.json>> | undefined
    ) => {
      if (!alive()) {
        unsubscribe();
        return Err("Socket disconnected");
      }
      if (subscriptions.has(key)) {
        unsubscribe();
      } else {
        subscriptions.set(key, unsubscribe);
      }
      return Ok({ subscribed: true, scope });
    };
    let pendingSubscriptions = 0;
    handle("nile:receive", async (input) => {
      const parsed = selectionSchema.safeParse(input);
      if (!parsed.success) {
        return Err("Invalid topic subscription");
      }
      const allowed = await authorize(parsed.data, false);
      if (allowed.isErr) {
        return allowed;
      }
      if (!alive()) {
        return Err("Socket disconnected");
      }
      if (subscriptions.has(allowed.value.key)) {
        return Ok({ subscribed: true, scope: allowed.value.scope });
      }
      if (subscriptions.size + pendingSubscriptions >= bounds.subscriptions) {
        return Err("Subscription capacity reached");
      }
      pendingSubscriptions++;
      const subscribed = await topics.receive({
        ...parsed.data,
        onMessage: deliver,
      });
      pendingSubscriptions--;
      if (subscribed.isErr) {
        return subscribed;
      }
      return releaseSubscription(
        allowed.value.key,
        subscribed.value.unsubscribe,
        allowed.value.scope
      );
    });
    handle("nile:unsubscribe", async (input) => {
      const parsed = selectionSchema.safeParse(input);
      if (!parsed.success) {
        return Err("Invalid subscription");
      }
      const selected = await topics.validate(parsed.data);
      if (selected.isErr) {
        return selected;
      }
      subscriptions.get(selected.value.key)?.();
      subscriptions.delete(selected.value.key);
      return Ok({ subscribed: false });
    });
    socket.on("disconnect", () => {
      controller.abort();
      for (const unsubscribe of subscriptions.values()) {
        unsubscribe();
      }
      subscriptions.clear();
      identities.delete(socket.id);
      quota.reset(socket.id);
    });
  });
  lifecycle.register({
    name: "websocket",
    stop: () => {
      accepting = false;
    },
    close: async () => {
      topics.close();
      io.disconnectSockets(true);
      bunEngine?.close();
      io.engine?.close();
      await io.sockets.adapter.close();
      nodeAttachment.detach();
      quota.close?.();
    },
  });
  return {
    ...topics.api,
    path,
    schema: createTopicSchemaReader(config.topics ?? {}),
    ...createBunSocketInterface(bunEngine, bounds),
    idleTimeout: 30,
    attachNode: nodeAttachment.attachNode,
    connections: () => identities.size,
  };
}
