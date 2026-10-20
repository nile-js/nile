import { fork, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const nodePath = execFileSync("node", ["-p", "process.execPath"], {
	encoding: "utf8",
}).trim();
export const NODE_VERSION = execFileSync(nodePath, ["-p", "process.version"], {
	encoding: "utf8",
}).trim();

/** Reject failed/exited children and bound every startup or control exchange. */
function waitMessage(child, kind, timeoutMs = 45_000) {
	return new Promise((resolve, reject) => {
		const cleanup = () => {
			clearTimeout(timer);
			child.off("message", onMessage);
			child.off("exit", onExit);
			child.off("error", onError);
		};
		const onMessage = (message) => {
			if (message.kind !== kind) {
				return;
			}
			cleanup();
			if (message.failure) {
				reject(new Error(message.failure));
			} else {
				resolve(message);
			}
		};
		const onExit = (code, signal) => {
			cleanup();
			reject(new Error(`Server exited ${code}/${signal}`));
		};
		const onError = (error) => {
			cleanup();
			reject(error);
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(new Error(`Timed out waiting for ${kind}`));
		}, timeoutMs);
		child.on("message", onMessage);
		child.on("exit", onExit);
		child.on("error", onError);
	});
}

/** Select the installed runtime explicitly; isolate server and load generator event loops. */
export function startServer(entry, mode) {
	const child = fork(
		fileURLToPath(new URL("./server.mjs", import.meta.url)),
		[entry.name, mode],
		{
			execPath: entry.runtime === "bun" ? process.execPath : nodePath,
			stdio: ["ignore", "pipe", "pipe", "ipc"],
		},
	);
	let output = "";
	const capture = (chunk) => {
		output = `${output}${chunk}`.slice(-6000);
	};
	child.stdout.on("data", capture);
	child.stderr.on("data", capture);
	const exited = new Promise((resolve) => child.once("exit", resolve));
	return {
		child,
		exited,
		ready: waitMessage(child, "ready"),
		output: () => output,
	};
}

/** Reset/check native stores outside timed HTTP traffic, including Encore's isolated control endpoint. */
export function control(server, kind) {
	const reply = waitMessage(server.child, kind);
	server.child.send({ kind });
	return reply;
}

/** Give framework shutdown a bounded opportunity to stop its owned listener/container. */
export async function stopServer(server) {
	if (server.child.exitCode !== null || server.child.signalCode !== null) {
		return;
	}
	if (server.child.connected) {
		server.child.send({ kind: "shutdown" });
	} else {
		server.child.kill("SIGTERM");
	}
	const terminate = setTimeout(() => server.child.kill("SIGTERM"), 8000);
	const kill = setTimeout(() => server.child.kill("SIGKILL"), 15_000);
	await server.exited;
	clearTimeout(terminate);
	clearTimeout(kill);
}
