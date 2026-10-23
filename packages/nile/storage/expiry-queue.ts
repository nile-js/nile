interface Expiry {
  key: string;
  time: number;
}

/** Keep at most one expiration node per key, avoiding stale heap records after frequent updates. */
export function createExpiryQueue() {
  const heap: Expiry[] = [];
  const indexes = new Map<string, number>();
  const swap = (first: number, second: number) => {
    const a = heap[first];
    const b = heap[second];
    if (!(a && b)) {
      return;
    }
    heap[first] = b;
    heap[second] = a;
    indexes.set(a.key, second);
    indexes.set(b.key, first);
  };
  const rise = (start: number) => {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const child = heap[index];
      const above = heap[parent];
      if (!(child && above) || above.time <= child.time) {
        break;
      }
      swap(index, parent);
      index = parent;
    }
    return index;
  };
  const sink = (start: number) => {
    let index = start;
    while (index < heap.length) {
      const left = index * 2 + 1;
      const right = left + 1;
      let next = index;
      const leftEntry = heap[left];
      const current = heap[next];
      if (leftEntry && current && leftEntry.time < current.time) {
        next = left;
      }
      const rightEntry = heap[right];
      const smallest = heap[next];
      if (rightEntry && smallest && rightEntry.time < smallest.time) {
        next = right;
      }
      if (next === index) {
        break;
      }
      swap(index, next);
      index = next;
    }
  };
  const remove = (key: string) => {
    const index = indexes.get(key);
    if (index === undefined) {
      return;
    }
    indexes.delete(key);
    const last = heap.pop();
    if (!last || index === heap.length) {
      return;
    }
    heap[index] = last;
    indexes.set(last.key, index);
    sink(rise(index));
  };
  return {
    set(key: string, time: number) {
      remove(key);
      indexes.set(key, heap.length);
      heap.push({ key, time });
      rise(heap.length - 1);
    },
    delete: remove,
    expired(now: number) {
      const keys: string[] = [];
      while (heap[0] && heap[0].time <= now) {
        const key = heap[0].key;
        remove(key);
        keys.push(key);
      }
      return keys;
    },
    clear() {
      heap.length = 0;
      indexes.clear();
    },
  };
}
