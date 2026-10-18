import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

/** Capture aggregate counters without inspecting environment files or other applications' data. */
export async function readHostCounters() {
  const [stat, memory, vm] = await Promise.all([
    readFile("/proc/stat", "utf8"),
    readFile("/proc/meminfo", "utf8"),
    readFile("/proc/vmstat", "utf8"),
  ]);
  const cpu = stat.split("\n")[0].trim().split(/\s+/).slice(1, 9).map(Number);
  const perCpu = stat
    .split("\n")
    .filter((line) => /^cpu[0-9]+ /.test(line))
    .map((line) => {
      const [name, ...fields] = line.trim().split(/\s+/);
      const values = fields.slice(0, 8).map(Number);
      return {
        id: Number(name.slice(3)),
        total: values.reduce((sum, value) => sum + value, 0),
        idle: values[3],
      };
    });
  const counter = (text, name) =>
    Number(text.match(new RegExp(`^${name}[: ]+([0-9]+)`, "m"))?.[1] ?? 0);
  return {
    at: new Date().toISOString(),
    total: cpu.reduce((sum, value) => sum + value, 0),
    idle: cpu[3],
    ioWait: cpu[4],
    swapIn: counter(vm, "pswpin"),
    swapOut: counter(vm, "pswpout"),
    availableKiB: counter(memory, "MemAvailable"),
    perCpu,
  };
}

/** Idle percentage excludes I/O waits so a busy disk cannot masquerade as a quiet PC. */
export function compareHostCounters({ before, after }) {
  const total = after.total - before.total;
  const perCpu = after.perCpu?.map((cpu) => {
    const old = before.perCpu.find(({ id }) => id === cpu.id);
    return {
      id: cpu.id,
      idlePercent:
        cpu.total > old.total
          ? (100 * (cpu.idle - old.idle)) / (cpu.total - old.total)
          : 0,
    };
  });
  return {
    startedAt: before.at,
    finishedAt: after.at,
    idlePercent: total > 0 ? (100 * (after.idle - before.idle)) / total : 0,
    ioWaitPercent:
      total > 0 ? (100 * (after.ioWait - before.ioWait)) / total : 0,
    swapInPages: after.swapIn - before.swapIn,
    swapOutPages: after.swapOut - before.swapOut,
    availableKiB: after.availableKiB,
    ...(perCpu ? { perCpu } : {}),
  };
}

/** Refuse a skewed run; the owner can keep using the PC while the coordinator waits. */
export async function waitForQuietHost({
  minimumIdlePercent,
  cpuIds = [],
  onSample,
  signal,
}) {
  let consecutive = 0;
  while (consecutive < 3) {
    signal?.throwIfAborted();
    const before = await readHostCounters();
    await delay(3000, undefined, { signal });
    const sample = compareHostCounters({
      before,
      after: await readHostCounters(),
    });
    await onSample(sample);
    const selectedCpusQuiet = cpuIds.every(
      (id) =>
        sample.perCpu?.find((cpu) => cpu.id === id)?.idlePercent >=
        minimumIdlePercent
    );
    const quiet =
      sample.idlePercent >= minimumIdlePercent &&
      selectedCpusQuiet &&
      sample.swapOutPages === 0 &&
      sample.availableKiB >= 1024 * 1024;
    consecutive = quiet ? consecutive + 1 : 0;
  }
}
