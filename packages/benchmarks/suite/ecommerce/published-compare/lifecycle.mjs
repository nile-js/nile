import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Bound startup and reject an exited or failed child before timing can begin. */
function waitReady(child) {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			clearTimeout(timeout);
			child.off("message", message);
			child.off("exit", exit);
			child.off("error", error);
		};
		const message = (value) => {
			if (value.kind === "ready") {
				cleanup();
				resolve(value);
			}
		};
		const exit = (code) => {
			cleanup();
			reject(new Error(`Comparison server exited ${code}`));
		};
		const error = (reason) => {
			cleanup();
			reject(reason);
		};
		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error("Comparison startup timeout"));
		}, 30_000);
		child.on("message", message);
		child.on("exit", exit);
		child.on("error", error);
	});
}

/** Give both artifacts separate fresh Bun processes and retain diagnostic logs without modifying either package. */
export function startServer(name, mode) {
	const child = fork(
		fileURLToPath(new URL("./server.mjs", import.meta.url)),
		[name, mode],
		{ execPath: process.execPath, stdio: ["ignore", "pipe", "pipe", "ipc"] },
	);
	let output = "";
	const capture = (chunk) => {
		output = `${output}${chunk}`.slice(-6000);
	};
	child.stdout.on("data", capture);
	child.stderr.on("data", capture);
	return {
		child,
		exited: new Promise((resolve) => child.once("exit", resolve)),
		ready: waitReady(child),
		output: () => output,
	};
}
