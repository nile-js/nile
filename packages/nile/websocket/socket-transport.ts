import { Err, Ok, type Result } from "slang-ts";
import type { Socket } from "socket.io";
import { Server } from "socket.io";
import z from "zod";
import type { AuthConfig } from "../auth/types";
import { createRateLimiter } from "../controls/rate-limit";
import { guardOperation } from "../diagnostics/guard-operation";
import { toPublicJson } from "../diagnostics/public-json";
import type { NileLifecycle } from "../lifecycle/types";
import { createTopicMessaging } from "../messaging/messaging";
import { createTopicSchemaReader } from "../messaging/schema";
import type { SocketUser, TopicAccess } from "../messaging/types";
import { publicationSchema, selectionSchema } from "../messaging/validation";
import { authenticateWithJwt, expiryOf } from "./socket-auth";
import { createBunSocketInterface } from "./socket-bun";
import { resolveSocketLimits } from "./socket-limits";
import { createNodeSocketAttachment } from "./socket-node";
import type {
  NileSocket,
  SocketConfig,
  SocketConnection,
} from "./socket-types";

type Ack = (result: {
  error: string | null;
  data: z.output<z.ZodType>;
}) => void;

const TRAILING_SLASH = /\/$/;

/** A permission must exist and return exactly `true`; throws and other values deny. */
async function checkAccess<A>(
  check: ((access: A) => boolean | Promise<boolean>) | undefined,
  access: A
): Promise<Result<true, string>> {
  if (!check) {
    return Err("Topic access is not permitted");
  }
  const allowed = await guardOperation(() => check(access));
  return allowed.isOk && allowed.value === true
    ? Ok(true)
    : Err("Topic access denied");
}

/** Lifecycle callbacks are the app's code; their failures never break a connection. */
function notify<T>(callback: ((input: T) => unknown) | undefined, input: T) {
  if (callback) {
    guardOperation(() => callback(input));
  }
}

/** Own one Socket.IO server per Nile instance; HTTP and sockets share the lifecycle and JWT config. */
export async function createSocketTransport({
  config,
  auth,
  lifecycle,
  runtime,
}: {
  config: SocketConfig;
  auth?: AuthConfig;
  lifecycle: NileLifecycle;
  runtime: "bun" | "node";
}): Promise<NileSocket> {
  const path = config.path ?? "/socket.io";
  if (!path.startsWith("/") || path.includes("?") || path.includes("#")) {
    throw new Error("Socket path must be an absolute URL path");
  }
  const bounds = resolveSocketLimits(config);
  const definitions = config.topics ?? {};
  const topics = createTopicMessaging(definitions);
  const definitionOf = (topic: string) =>
    Object.hasOwn(definitions, topic) ? definitions[topic] : undefined;
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
    { user: SocketUser | undefined; request: Request }
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
    const authenticated = guardOperation(() => {
      const handshake = {
        request,
        auth: z.record(z.string(), z.string()).parse(socket.handshake.auth),
      };
      return config.authenticate
        ? config.authenticate(handshake)
        : authenticateWithJwt(handshake, auth);
    });
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
      identities.set(socket.id, {
        user: result.value ?? undefined,
        request,
      });
      next();
    });
  });
  io.on("connection", (socket: Socket) => {
    const entry = identities.get(socket.id);
    if (!entry) {
      socket.disconnect(true);
      return;
    }
    const connection: SocketConnection = {
      connectionId: socket.id,
      user: entry.user,
    };
    const expiresAt = expiryOf(entry.user);
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
      (expiresAt === undefined || expiresAt > Date.now());
    const deliver = (message: z.output<z.ZodType>) => {
      if (!alive()) {
        socket.disconnect(true);
        return;
      }
      const publicMessage = toPublicJson(message);
      const size = new TextEncoder().encode(
        JSON.stringify(publicMessage)
      ).byteLength;
      if (bufferedBytes + size > bounds.buffered) {
        socket.disconnect(true);
        return;
      }
      socket.emit("nile:message", publicMessage);
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
        guardOperation(async () => {
          const result = await fn(input);
          return result.isOk ? Ok(toPublicJson(result.value ?? null)) : result;
        })
          .finally(() => {
            active--;
            admission.value.finish();
          })
          .then((result) => {
            if (controller.signal.aborted) {
              return;
            }
            guardOperation(() =>
              ack({
                error: result.isErr ? String(result.error) : null,
                data: result.isOk ? result.value : null,
              })
            );
          });
      });
    };
    const accessFor = (
      topic: string,
      scope: TopicAccess["scope"]
    ): TopicAccess => ({
      topic,
      scope,
      user: entry.user,
      connectionId: socket.id,
    });
    handle("nile:send", async (input) => {
      const parsed = publicationSchema.safeParse(input);
      if (!parsed.success) {
        return Err("Invalid topic message");
      }
      const definition = definitionOf(parsed.data.topic);
      return await topics.send(parsed.data, {
        from: { connectionId: socket.id, userId: entry.user?.userId },
        authorize: async (selected, data) => {
          const allowed = await checkAccess(definition?.canSend, {
            ...accessFor(selected.topic, selected.scope),
            data,
          });
          if (allowed.isOk && !alive()) {
            return Err("Socket disconnected");
          }
          return allowed;
        },
      });
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
    /** Validate the selection, then require the topic's `canReceive`. */
    const selectReceivable = async (input: z.input<z.ZodType>) => {
      const parsed = selectionSchema.safeParse(input);
      if (!parsed.success) {
        return Err("Invalid topic subscription");
      }
      const selected = await topics.validate(parsed.data);
      if (selected.isErr) {
        return selected;
      }
      const permitted = await checkAccess(
        definitionOf(parsed.data.topic)?.canReceive,
        accessFor(selected.value.topic, selected.value.scope)
      );
      if (permitted.isErr) {
        return Err(permitted.error);
      }
      return Ok({ input: parsed.data, ...selected.value });
    };
    let pendingSubscriptions = 0;
    handle("nile:receive", async (input) => {
      const allowed = await selectReceivable(input);
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
      const subscribed = await topics.receive(
        { ...allowed.value.input, onMessage: deliver },
        { connectionId: socket.id, userId: entry.user?.userId }
      );
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
    socket.on("disconnect", (reason: string) => {
      controller.abort();
      for (const unsubscribe of subscriptions.values()) {
        unsubscribe();
      }
      subscriptions.clear();
      identities.delete(socket.id);
      quota.reset(socket.id);
      notify(config.onDisconnect, { ...connection, reason });
    });
    notify(config.onConnect, connection);
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
    schema: createTopicSchemaReader(definitions),
    ...createBunSocketInterface(bunEngine, bounds),
    attachNode: nodeAttachment.attachNode,
    connections: () => identities.size,
  };
}
