import { readFile } from "node:fs/promises";

/** Verify distinct physical cores instead of treating hyperthreads as isolated CPUs. */
export async function readCpuTopology({ serverCpu, clientCpu }) {
  const records = await Promise.all(
    [serverCpu, clientCpu].map(async (id) => {
      const path = `/sys/devices/system/cpu/cpu${id}/topology`;
      const [core, socket, siblings] = await Promise.all([
        readFile(`${path}/core_id`, "utf8"),
        readFile(`${path}/physical_package_id`, "utf8"),
        readFile(`${path}/thread_siblings_list`, "utf8"),
      ]);
      const siblingIds = siblings
        .trim()
        .split(",")
        .flatMap((part) => {
          const [first, last = first] = part.split("-").map(Number);
          return Array.from(
            { length: last - first + 1 },
            (_, offset) => first + offset
          );
        });
      return {
        id,
        core: Number(core.trim()),
        socket: Number(socket.trim()),
        siblingIds,
      };
    })
  );
  if (
    records[0].core === records[1].core &&
    records[0].socket === records[1].socket
  )
    throw Error(
      "Server and generator CPUs must belong to different physical cores"
    );
  return records;
}
