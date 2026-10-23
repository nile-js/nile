import type { Result } from "slang-ts";

export interface MemoryStoreOptions {
  maxKeys?: number;
  ttlMs?: number;
  /** Reject by default; LRU is appropriate only when losing a cached value is acceptable. */
  eviction?: "reject-new" | "lru";
  clock?: () => number;
}
export interface MemoryStore<T> {
  set: (input: {
    key: string;
    value: T;
    ttlMs?: number;
  }) => Result<null, string>;
  get: (key: string) => T | undefined;
  has: (key: string) => boolean;
  delete: (key: string) => boolean;
  /** Synchronous compare-and-delete; object values are matched by identity. */
  consume: (input: { key: string; expected: T }) => boolean;
  size: () => number;
  clear: () => void;
  close: () => void;
}
