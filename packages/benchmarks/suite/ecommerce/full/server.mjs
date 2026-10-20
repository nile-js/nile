import { safeTry } from "slang-ts";
import { createFullFixture } from "./registry.mjs";

const [name, mode] = process.argv.slice(2);
const fixture = await createFullFixture(name, mode);
let handle;
let closing = false;

/** Close only the benchmark-owned listener/container and release its lifecycle before exit. */
async function shutdown() {
	if (closing) {
		return;
	}
	closing = true;
	const stopped = await safeTry(async () => {
		if (handle) {
			await handle.close();
		} else {
			await fixture.close?.();
		}
	});
	if (stopped.isErr) {
		console.error(stopped.error);
	}
	process.exit(stopped.isErr ? 1 : 0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("disconnect", shutdown);
process.on("message", async ({ kind }) => {
	if (kind === "shutdown") {
		return shutdown();
	}
	const result = await safeTry(async () => {
		if (kind === "reset") {
			await fixture.reset();
		}
		return {
			kind,
			state: await fixture.state(),
			resource: name === "encore" ? null : process.resourceUsage(),
			memory: name === "encore" ? null : process.memoryUsage(),
		};
	});
	process.send(
		result.isErr ? { kind, failure: String(result.error) } : result.value,
	);
});
const started = await safeTry(async () => {
	handle = await fixture.start();
	process.send({
		kind: "ready",
		url: handle.url,
		headers: fixture.headers,
		routeCount: fixture.routeCount ?? 300,
		actualRuntime: {
			node: name === "encore" ? handle.runtimeVersion : process.versions.node,
			image: handle.image ?? null,
			launcherNode: name === "encore" ? process.versions.node : null,
			bun: process.versions.bun ?? null,
		},
		telemetryScope:
			name === "encore"
				? "Unavailable: application runs inside Docker; launcher counters excluded"
				: "Actual application server process",
	});
});
if (started.isErr) {
	console.error(started.error);
	await shutdown();
}
