import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { safeTry } from "slang-ts";
import { JOURNEYS, WARMUP, runLoad } from "../client.mjs";
import { checkFullAdmission, prepareFullJourneys } from "./admission.mjs";
import { CONTENDERS } from "./registry.mjs";
import { startServer, stopServer, control } from "./lifecycle.mjs";
import { snapshotHost, provenance, saveReport } from "./report.mjs";
import { readContinuation } from "./resume.mjs";

if (!process.versions.bun) {
	throw new Error("Use Bun for the shared load generator");
}
const { values } = parseArgs({
	options: {
		rounds: { type: "string", default: "6" },
		smoke: { type: "boolean", default: false },
		resume: { type: "string" },
	},
});
const rounds = Number(values.rounds);
if (!Number.isSafeInteger(rounds) || rounds < 1) {
	throw new Error("Invalid rounds");
}
const current = await provenance();
const continuation = values.resume
	? await readContinuation({ path: values.resume, rounds, current })
	: null;
const rows = continuation?.rows ?? [];
const started = performance.now() - (continuation?.elapsedMs ?? 0);
const directory =
	continuation?.directory ??
	new URL(
		`../../../results/${new Date().toISOString().replaceAll(":", "-")}${values.smoke ? "-admission" : ""}/`,
		import.meta.url,
	);
const frozen = continuation?.frozen ?? current;
let active;
let scenario;

/** Verify state accounting after every unmeasured admission and measured batch. */
function assertState(state, orders) {
	if (state.carts !== 0 || state.orders !== orders) {
		throw new Error(
			`State mismatch: ${JSON.stringify(state)}, expected ${orders}orders`,
		);
	}
}

/** Fully check the actual protocol before timing an identical dependent ecommerce workflow. */
async function measure(entry, mode, round) {
	scenario = { framework: entry.name, runtime: entry.runtime, mode, round };
	const plans = values.smoke
		? []
		: prepareFullJourneys(entry.name, JOURNEYS, "measure");
	const warmup = values.smoke
		? []
		: prepareFullJourneys(entry.name, WARMUP, "warmup");
	const server = startServer(entry, mode);
	active = server;
	const result = await safeTry(async () => {
		const connection = await server.ready;
		await checkFullAdmission(connection, entry.name, mode);
		assertState((await control(server, "metrics")).state, 50);
		const reset = await control(server, "reset");
		assertState(reset.state, 0);
		if (values.smoke) {
			return {
				...scenario,
				admission: true,
				runtimeDetails: connection.actualRuntime,
			};
		}
		await runLoad(connection, warmup);
		const before = await control(server, "reset");
		assertState(before.state, 0);
		const hostBefore = snapshotHost();
		const metrics = await runLoad(connection, plans);
		const hostAfter = snapshotHost();
		const after = await control(server, "metrics");
		assertState(after.state, JOURNEYS);
		return {
			...scenario,
			...metrics,
			state: after.state,
			runtimeDetails: connection.actualRuntime,
			telemetryScope: connection.telemetryScope,
			serverCpuMs: after.resource
				? (after.resource.userCPUTime +
						after.resource.systemCPUTime -
						before.resource.userCPUTime -
						before.resource.systemCPUTime) /
					1000
				: null,
			serverRssBytes: after.memory?.rss ?? null,
			serverMaxRssKiB: after.resource?.maxRSS ?? null,
			hostBusyPercent:
				100 *
				(1 -
					(hostAfter.idle - hostBefore.idle) /
						(hostAfter.total - hostBefore.total)),
			hostBefore,
			hostAfter,
		};
	});
	await stopServer(server);
	active = undefined;
	if (result.isErr) {
		throw new Error(
			`${JSON.stringify(scenario)}: ${result.error}\n${server.output()}`,
		);
	}
	rows.push(result.value);
	console.log(
		`${rows.length}/${(values.smoke ? 1 : rounds) * CONTENDERS.length * 2} round${round} ${entry.name}/${mode}: ${values.smoke ? "admission passed" : `${Math.round(result.value.requestsPerSecond)}req/s p95journey${result.value.journeyP95Ms.toFixed(1)}ms`}`,
	);
}

/** Rotate complete rounds and alternate validation order to spread desktop-time effects. */
async function runRound(round, persist) {
	const offset = ((round - 1) * 3) % CONTENDERS.length;
	const order = [...CONTENDERS.slice(offset), ...CONTENDERS.slice(0, offset)];
	const modes = round % 2 ? ["plain", "validated"] : ["validated", "plain"];
	for (const entry of order) {
		for (const mode of modes) {
			if (
				rows.some(
					(row) =>
						row.round === round &&
						row.framework === entry.name &&
						row.mode === mode,
				)
			) {
				continue;
			}
			await measure(entry, mode, round);
			if (!values.smoke) {
				await persist();
			}
		}
	}
	console.log(`All ${CONTENDERS.length} contenders completed round ${round}`);
}

/** Complete every contender before advancing the round, preserving all busy-desktop samples. */
async function run() {
	console.log(`Evidence: ${fileURLToPath(directory)}`);
	const persist = (completed = false, failure = undefined) =>
		saveReport({
			directory,
			rows: values.smoke ? [] : rows,
			rounds,
			started,
			frozen,
			completed,
			failure,
		});
	const heartbeat = setInterval(
		() =>
			console.log(
				JSON.stringify({
					completedScenarios: rows.length,
					active: scenario,
					elapsedSeconds: Math.round((performance.now() - started) / 1000),
				}),
			),
		20_000,
	);
	const deadline = setTimeout(async () => {
		console.error(
			"60-minute continuation deadline exceeded; stopping owned server",
		);
		if (active) {
			await stopServer(active);
		}
		await persist(false, "60-minute continuation deadline exceeded");
		process.exit(1);
	}, 3_600_000);
	process.once("SIGTERM", async () => {
		if (active) {
			await stopServer(active);
		}
		await persist(false, "Interrupted");
		process.exit(1);
	});
	process.once("SIGINT", async () => {
		if (active) {
			await stopServer(active);
		}
		await persist(false, "Interrupted");
		process.exit(1);
	});
	const result = await safeTry(async () => {
		for (const round of Array.from(
			{ length: values.smoke ? 1 : rounds },
			(_, i) => i + 1,
		)) {
			await runRound(round, persist);
		}
	});
	clearInterval(heartbeat);
	clearTimeout(deadline);
	if (active) {
		await stopServer(active);
	}
	if (values.smoke) {
		const { mkdir, writeFile } = await import("node:fs/promises");
		await mkdir(directory, { recursive: true });
		await writeFile(
			new URL("admission.json", directory),
			JSON.stringify(
				{
					completed: result.isOk,
					failure: result.isErr ? String(result.error) : null,
					rows,
				},
				null,
				2,
			),
		);
	} else {
		await persist(
			result.isOk && rows.length === rounds * CONTENDERS.length * 2,
			result.isErr ? String(result.error) : undefined,
		);
	}
	if (result.isErr) {
		console.error(result.error);
		process.exitCode = 1;
	} else {
		console.log(
			`Complete in${Math.round((performance.now() - started) / 1000)}s: ${fileURLToPath(directory)}`,
		);
	}
}
await run();
