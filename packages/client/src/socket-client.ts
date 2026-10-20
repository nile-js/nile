import type { Socket } from "socket.io-client";
import type {
  ActionShape,
  NileSocketClient,
  NileSocketClientConfig,
  SocketActions,
  SocketTopics,
  TopicShape,
} from "./socket-types.js";
import type { ClientResult } from "./types.js";

type WireValue = object | string | number | boolean | null | undefined;
interface Listener {
  topic: string;
  scope?: WireValue;
  onMessage: (message: WireValue) => void;
  active: boolean;
  normalizedScope?: WireValue;
}

/** Own a lazy Socket.IO connection with no offline write buffering or automatic invocation retries. */
export function createNileSocketClient<
  Actions extends ActionShape<Actions> = SocketActions,
  Topics extends TopicShape<Topics> = SocketTopics,
>(config: NileSocketClientConfig): NileSocketClient<Actions, Topics> {
  const timeout = config.timeout ?? 30_000;
  if (!Number.isSafeInteger(timeout) || timeout < 1) {
    throw new Error("Socket timeout must be positive");
  }
  let socket: Socket | undefined;
  let connecting: Promise<ClientResult<Socket>> | undefined;
  let closed = false;
  const listeners = new Set<Listener>();
  const pending = new Set<() => void>();
  const fail = <T>(error: string): ClientResult<T> => ({ error, data: null });
  const settleCallback = (fn: () => void) => {
    Promise.resolve()
      .then(fn)
      .catch(() => undefined);
  };
  const request = async <T>(
    event: string,
    input: WireValue
  ): Promise<ClientResult<T>> => {
    const connected = await connect();
    if (!connected.data) {
      return fail(connected.error ?? "Socket unavailable");
    }
    const current = connected.data;
    if (!current.connected || closed) {
      return fail("Socket disconnected");
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: ClientResult<T>) => {
        if (settled) {
          return;
        }
        settled = true;
        pending.delete(cancel);
        clearTimeout(timer);
        resolve(result);
      };
      const cancel = () => finish(fail("Socket disconnected"));
      const timer = setTimeout(
        () => finish(fail("Socket acknowledgement timed out")),
        timeout
      );
      pending.add(cancel);
      // The connection check and emit are synchronous; disconnected calls never enter the offline queue.
      current.emit(event, input, (result: ClientResult<T>) => {
        if (
          !result ||
          typeof result !== "object" ||
          !("error" in result) ||
          !("data" in result)
        ) {
          finish(fail("Invalid socket response"));
          return;
        }
        finish(result);
      });
    });
  };
  const rejoin = async () => {
    for (const listener of listeners) {
      if (!listener.active) {
        continue;
      }
      const result = await request<{ scope?: WireValue }>("nile:receive", {
        topic: listener.topic,
        scope: listener.scope,
      });
      if (!result.error) {
        listener.normalizedScope = result.data?.scope;
      }
      if (result.error) {
        settleCallback(() =>
          config.onSubscriptionError?.({
            topic: listener.topic,
            error: result.error ?? "Subscription failed",
          })
        );
      }
    }
  };
  const connect = (): Promise<ClientResult<Socket>> => {
    if (closed) {
      return Promise.resolve(fail("Socket client is closed"));
    }
    if (socket?.connected) {
      return Promise.resolve({ error: null, data: socket });
    }
    if (connecting) {
      return connecting;
    }
    connecting = import("socket.io-client")
      .then(
        ({ io }) =>
          new Promise<ClientResult<Socket>>((resolve) => {
            if (closed) {
              resolve(fail("Socket client is closed"));
              return;
            }
            const current =
              socket ??
              io(config.baseUrl, {
                path: config.path ?? "/socket.io",
                autoConnect: false,
                withCredentials: true,
                timeout,
                auth: (done) => {
                  Promise.resolve()
                    .then(() =>
                      typeof config.auth === "function"
                        ? config.auth()
                        : (config.auth ?? {})
                    )
                    .then(done)
                    .catch(() => done({}));
                },
              });
            if (!socket) {
              socket = current;
              current.on("disconnect", () => {
                for (const cancel of [...pending]) {
                  cancel();
                }
              });
              current.on("connect", () => {
                rejoin();
              });
              current.on("nile:message", (message: WireValue) =>
                dispatchMessage(message, listeners)
              );
            }
            let settled = false;
            const finish = (result: ClientResult<Socket>) => {
              if (settled) {
                return;
              }
              settled = true;
              clearTimeout(timer);
              current.off("connect", ready);
              current.off("connect_error", failed);
              pending.delete(cancel);
              resolve(result);
            };
            const ready = () => finish({ error: null, data: current });
            const failed = () => finish(fail("Socket connection failed"));
            const cancel = () => finish(fail("Socket client closed"));
            const timer = setTimeout(
              () => finish(fail("Socket connection timed out")),
              timeout
            );
            pending.add(cancel);
            current.once("connect", ready);
            current.once("connect_error", failed);
            current.connect();
          })
      )
      .catch(() => fail<Socket>("Could not initialize socket client"))
      .finally(() => {
        connecting = undefined;
      });
    return connecting;
  };
  return {
    invoke: (input) => request("nile:invoke", input),
    send: (input) => request("nile:send", input),
    async receive(input) {
      const listener: Listener = {
        ...input,
        scope: input.scope as WireValue,
        onMessage: input.onMessage as Listener["onMessage"],
        active: true,
      };
      listeners.add(listener);
      const result = await request<{ subscribed: boolean; scope?: WireValue }>(
        "nile:receive",
        { topic: input.topic, scope: input.scope }
      );
      if (result.error) {
        listeners.delete(listener);
        return fail(result.error);
      }
      listener.normalizedScope = result.data?.scope;
      return {
        error: null,
        data: {
          unsubscribe: () => {
            listener.active = false;
            listeners.delete(listener);
            const shared = [...listeners].some(
              (item) =>
                item.topic === listener.topic &&
                stableScope(item.scope) === stableScope(listener.scope)
            );
            if (shared || closed) {
              return Promise.resolve({
                error: null,
                data: { subscribed: shared },
              });
            }
            return request("nile:unsubscribe", {
              topic: listener.topic,
              scope: listener.scope,
            });
          },
        },
      };
    },
    close() {
      closed = true;
      listeners.clear();
      for (const cancel of [...pending]) {
        cancel();
      }
      socket?.disconnect();
      socket?.removeAllListeners();
    },
  };
}

/** Match scoped messages independently of object property insertion order. */
function stableScope(scope: WireValue): string {
  if (scope === undefined || scope === null) {
    return "null";
  }
  if (Array.isArray(scope)) {
    return `[${scope.map(stableScope).join(",")}]`;
  }
  if (typeof scope === "object") {
    return `{${Object.keys(scope)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableScope((scope as Record<string, WireValue>)[key])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(scope);
}

/** Deliver messages only to listeners for the same validated topic and scope. */
function dispatchMessage(message: WireValue, listeners: Set<Listener>) {
  if (!message || typeof message !== "object" || !("topic" in message)) {
    return;
  }
  const scope = stableScope(
    "scope" in message ? (message.scope as WireValue) : undefined
  );
  for (const listener of listeners) {
    if (!listener.active || listener.topic !== message.topic) {
      continue;
    }
    if (stableScope(listener.normalizedScope ?? listener.scope) !== scope) {
      continue;
    }
    Promise.resolve()
      .then(() => listener.onMessage(message))
      .catch(() => undefined);
  }
}
