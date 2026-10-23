import { Err, Ok } from "slang-ts";
import { createExpiryQueue } from "./expiry-queue";
import type { MemoryStore, MemoryStoreOptions } from "./types";

/** Bound ephemeral values with target-only read expiry, indexed expiration and explicit cache eviction. */
export function createMemoryStore<T>(
  options: MemoryStoreOptions = {}
): MemoryStore<T> {
  const maxKeys = options.maxKeys ?? 1000;
  if (!Number.isSafeInteger(maxKeys) || maxKeys < 1) {
    throw new Error("Store maxKeys must be positive");
  }
  const isDuration = (value: number) =>
    Number.isSafeInteger(value) && value > 0;
  if (options.ttlMs !== undefined && !isDuration(options.ttlMs)) {
    throw new Error("Store ttlMs must be positive");
  }
  if (
    options.eviction !== undefined &&
    !["reject-new", "lru"].includes(options.eviction)
  ) {
    throw new Error("Store eviction policy is invalid");
  }
  if (options.clock !== undefined && typeof options.clock !== "function") {
    throw new Error("Store clock must be a function");
  }
  const clock = options.clock ?? (() => performance.now());
  const values = new Map<string, { value: T; expiresAt?: number }>();
  const expiry = createExpiryQueue();
  let closed = false;
  const remove = (key: string) => {
    expiry.delete(key);
    return values.delete(key);
  };
  const sweep = () => {
    for (const key of expiry.expired(clock())) {
      values.delete(key);
    }
  };
  const read = (key: string) => {
    const entry = values.get(key);
    if (entry?.expiresAt !== undefined && entry.expiresAt <= clock()) {
      remove(key);
      return undefined;
    }
    if (entry && options.eviction === "lru") {
      values.delete(key);
      values.set(key, entry);
    }
    return entry;
  };
  const clear = () => {
    values.clear();
    expiry.clear();
  };
  const reserveKey = (key: string) => {
    if (values.has(key) || values.size < maxKeys) {
      return Ok(null);
    }
    if (options.eviction !== "lru") {
      return Err("Memory store capacity reached");
    }
    const oldest = values.keys().next().value;
    if (oldest !== undefined) {
      remove(oldest);
    }
    return Ok(null);
  };
  return {
    set({ key, value, ttlMs = options.ttlMs }) {
      if (closed) {
        return Err("Memory store is closed");
      }
      if (typeof key !== "string" || !key || key.length > 512) {
        return Err("Store key must contain 1 to 512 characters");
      }
      if (ttlMs !== undefined && !isDuration(ttlMs)) {
        return Err("Store ttlMs must be positive");
      }
      sweep();
      const reserved = reserveKey(key);
      if (reserved.isErr) {
        return reserved;
      }
      remove(key);
      const expiresAt = ttlMs === undefined ? undefined : clock() + ttlMs;
      values.set(key, { value, expiresAt });
      if (expiresAt !== undefined) {
        expiry.set(key, expiresAt);
      }
      return Ok(null);
    },
    get: (key) => read(key)?.value,
    has: (key) => read(key) !== undefined,
    delete: remove,
    consume({ key, expected }) {
      const entry = read(key);
      return entry && Object.is(entry.value, expected) ? remove(key) : false;
    },
    size() {
      sweep();
      return values.size;
    },
    clear,
    close() {
      closed = true;
      clear();
    },
  };
}
