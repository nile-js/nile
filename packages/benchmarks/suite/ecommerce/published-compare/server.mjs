import { safeTry } from "slang-ts";
import { createComparisonFixture } from "./fixture.mjs";

const fixture = await createComparisonFixture(process.argv[2], process.argv[3]);
const server = fixture.start();
let closing = false;

/** Stop only this comparison's listener and exit after the coordinator is finished. */
function close() {
	if (closing) {
		return;
	}
	closing = true;
	server.close();
	process.exit(0);
}
process.on("SIGTERM", close);
process.on("disconnect", close);
process.on("message", async ({ kind }) => {
	if (kind === "shutdown") {
		return close();
	}
	const result = await safeTry(() => {
		if (kind === "reset") {
			fixture.reset();
		}
		return {
			kind,
			state: fixture.state(),
			resource: process.resourceUsage(),
			memory: process.memoryUsage(),
		};
	});
	process.send(
		result.isErr ? { kind, failure: String(result.error) } : result.value,
	);
});
process.send({ kind: "ready", url: server.url, headers: fixture.headers });
