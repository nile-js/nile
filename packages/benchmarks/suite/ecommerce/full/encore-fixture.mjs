import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { sign } from "hono/jwt";
import { safeTry } from "slang-ts";
import { CUSTOMER, ORIGIN, SECRET } from "../workload.mjs";

const runFile = promisify(execFile);
const IMAGE = "nile-benchmark-encore-ecommerce:1.58.6";
const CONTROL_SECRET = "isolated-ecommerce-control";
const MISSING_CONTAINER = /No such (?:object|container)/i;

/** Run bounded Docker operations; never select or modify unrelated containers. */
async function docker(args, timeout = 15_000) {
	return (
		await runFile("docker", args, { timeout, maxBuffer: 1024 * 1024 })
	).stdout.trim();
}

/** Reserve a loopback port briefly before starting Encore's production listener. */
async function allocatePort() {
	const server = createServer();
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("No Encore benchmark port");
	}
	await new Promise((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	);
	return address.port;
}

/** Wait for the real application, surfacing early runtime crashes and cancellation. */
async function waitReady(name, control, isClosing) {
	const deadline = Date.now() + 45_000;
	while (Date.now() < deadline) {
		if (isClosing()) {
			throw new Error("Encore startup cancelled");
		}
		const inspected = await safeTry(() =>
			docker(["inspect", "--format", "{{.State.Running}}", name], 5000),
		);
		if (inspected.isErr || inspected.value !== "true") {
			const logs = await safeTry(() => docker(["logs", name], 5000));
			throw new Error(
				`Encore exited before readiness: ${logs.isErr ? logs.error : logs.value}`,
			);
		}
		const ready = await safeTry(() => control("state"));
		if (!ready.isErr) {
			return docker(["exec", name, "node", "--version"], 5000);
		}
		await delay(100);
	}
	throw new Error("Encore production readiness timeout");
}

/** Create a genuine Encore production image fixture with coordinator-only state controls. */
export async function createEncoreFixture(mode) {
	if (!["plain", "validated"].includes(mode)) {
		throw new Error("Invalid Encore benchmark mode");
	}
	const token = await sign(
		{
			sub: CUSTOMER,
			organizationId: "benchmark",
			exp: Math.floor(Date.now() / 1000) + 3600,
		},
		SECRET,
		"HS256",
	);
	const headers = {
		origin: ORIGIN,
		authorization: `Bearer ${token}`,
		"content-type": "application/json",
	};
	let connection;
	let closingRequested = false;
	/** Keep mutable state and warmup resets inside the actual Encore process. */
	async function control(operation) {
		if (!connection) {
			throw new Error("Encore fixture is not started");
		}
		const response = await fetch(`${connection.url}/benchmark/control`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-benchmark-control": CONTROL_SECRET,
			},
			body: JSON.stringify({ operation }),
			signal: AbortSignal.timeout(10_000),
		});
		const body = await response.json();
		if (response.status !== 200 || body.status !== true || !body.state) {
			throw new Error("Encore state control failed");
		}
		return body.state;
	}
	return {
		headers,
		routeCount: 300,
		reset: () => control("reset"),
		state: () => control("state"),
		close: async () => {
			closingRequested = true;
			await connection?.close();
		},
		start: async () => {
			if (connection) {
				throw new Error("Encore fixture already started");
			}
			const port = await allocatePort();
			const isolation = await mkdtemp(join(tmpdir(), "nile-ecommerce-encore-"));
			const configFile = `${isolation}/runtime.json`;
			await writeFile(configFile, `${JSON.stringify({ mode })}\n`, {
				flag: "wx",
			});
			const name = `nile-ecommerce-encore-${crypto.randomUUID()}`;
			let stopped = false;
			let pendingDocker;
			/** Stop and verify only this invocation's uniquely named auto-removed container. */
			async function close() {
				if (stopped) {
					return;
				}
				closingRequested = true;
				if (pendingDocker) {
					await safeTry(() => pendingDocker);
				}
				await safeTry(() => docker(["stop", "--time", "3", name], 7000));
				const checked = await safeTry(() =>
					docker(["inspect", "--format", "{{.State.Running}}", name], 5000),
				);
				if (!checked.isErr && checked.value === "true") {
					await docker(["kill", name], 5000);
				}
				const verified = await safeTry(() =>
					docker(["inspect", "--format", "{{.State.Running}}", name], 5000),
				);
				if (!verified.isErr && verified.value === "true") {
					throw new Error("Owned Encore benchmark container survived cleanup");
				}
				if (verified.isErr && !MISSING_CONTAINER.test(String(verified.error))) {
					throw new Error(`Cannot verify Encore cleanup: ${verified.error}`);
				}
				stopped = true;
				connection = undefined;
			}
			connection = { url: `http://127.0.0.1:${port}`, close };
			const launched = await safeTry(async () => {
				if (closingRequested) {
					throw new Error("Encore startup cancelled");
				}
				pendingDocker = docker(
					[
						"run",
						"-d",
						"--rm",
						"--name",
						name,
						"--network",
						"host",
						"--mount",
						`type=bind,source=${configFile},target=/tmp/nile-ecommerce-encore.json,readonly`,
						"--env",
						`ENCORE_LISTEN_ADDR=127.0.0.1:${port}`,
						"--env",
						`PORT=${port}`,
						"--env",
						"ENCORE_RUNTIME_LOG=error",
						"--env",
						"ENCORE_LOG=Off",
						"--env",
						"NODE_ENV=production",
						IMAGE,
					],
					30_000,
				);
				const id = await pendingDocker;
				if (closingRequested) {
					throw new Error("Encore startup cancelled");
				}
				const runtimeVersion = await waitReady(
					name,
					control,
					() => closingRequested,
				);
				return {
					...connection,
					containerId: id,
					image: IMAGE,
					runtimeVersion,
					configurationFile: configFile,
				};
			});
			if (launched.isErr) {
				await close();
				throw new Error(`Encore launch failed: ${launched.error}`);
			}
			return launched.value;
		},
	};
}
