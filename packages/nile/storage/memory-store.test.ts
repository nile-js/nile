import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./memory-store";

describe("bounded ephemeral storage", () => {
  it("updates expiration without stale heap nodes deleting newer values", () => {
    let now = 0;
    const store = createMemoryStore<number>({ maxKeys: 2, clock: () => now });
    store.set({ key: "a", value: 1, ttlMs: 5 });
    store.set({ key: "b", value: 2, ttlMs: 10 });
    store.set({ key: "a", value: 3, ttlMs: 20 });
    now = 6;
    expect(store.get("a")).toBe(3);
    expect(store.set({ key: "c", value: 4 }).isErr).toBe(true);
    now = 11;
    expect(store.set({ key: "c", value: 4 }).isOk).toBe(true);
    expect(store.get("b")).toBeUndefined();
    expect(store.get("a")).toBe(3);
    now = 21;
    expect(store.has("a")).toBe(false);
    expect(store.size()).toBe(1);
  });
  it("uses explicit LRU only for caches and consumes a value atomically", () => {
    const store = createMemoryStore<number | null | undefined>({
      maxKeys: 2,
      eviction: "lru",
    });
    store.set({ key: "a", value: 1 });
    store.set({ key: "b", value: 2 });
    expect(store.get("a")).toBe(1);
    store.set({ key: "c", value: 3 });
    expect(store.has("b")).toBe(false);
    expect(store.consume({ key: "a", expected: 2 })).toBe(false);
    expect(store.consume({ key: "a", expected: 1 })).toBe(true);
    expect(store.consume({ key: "a", expected: 1 })).toBe(false);
    store.set({ key: "nullable", value: null });
    expect(store.get("nullable")).toBeNull();
    store.set({ key: "empty", value: undefined });
    expect(store.has("empty")).toBe(true);
    store.close();
    expect(store.size()).toBe(0);
    expect(store.set({ key: "late", value: 1 }).isErr).toBe(true);
  });
  it("maintains expiration ordering through mixed deletes and replacements", () => {
    let now = 0;
    const store = createMemoryStore<number>({ maxKeys: 100, clock: () => now });
    for (let index = 0; index < 100; index++) {
      store.set({ key: String(index), value: index, ttlMs: 100 - index });
    }
    for (let index = 0; index < 100; index += 3) {
      store.delete(String(index));
    }
    for (let index = 0; index < 100; index += 5) {
      store.set({ key: String(index), value: index, ttlMs: 200 });
    }
    now = 101;
    expect(store.size()).toBe(20);
    for (let index = 0; index < 100; index++) {
      expect(store.has(String(index))).toBe(index % 5 === 0);
    }
    now = 201;
    expect(store.size()).toBe(0);
  });
});
