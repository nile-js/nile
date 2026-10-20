import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { safeTry } from "slang-ts";
import { JOURNEYS, WARMUP, runLoad, prepareJourneys } from "../client.mjs";
import { checkFullAdmission } from "../full/admission.mjs";
import { snapshotHost, summarize } from "../full/report.mjs";
import { ENTRIES } from "./fixture.mjs";
import { startServer } from "./lifecycle.mjs";
import { control, stopServer } from "../full/lifecycle.mjs";

if (!process.versions.bun) {
	throw new Error("Comparison requires Bun");
}
const rounds = 3;
const smoke = process.argv.includes("--smoke");
const directory = new URL(
	`../../../results/npm-comparison-${new Date().toISOString().replaceAll(":", "-")}/`,
	import.meta.url,
);
const started = performance.now();
const rows = [];
let active;
let scenario;

/** Hash published and current artifacts and the unchanged shared benchmark inputs before timing. */
async function provenance() {
	const files = [
		"../../../../nile/dist/index.js",
		"../published/node_modules/@nilejs/nile/dist/index.js",
		"../published/bun.lock",
		"../workload.mjs",
		"../client.mjs",
		"../full/admission.mjs",
		"./fixture.mjs",
		"./server.mjs",
		"./run.mjs",
		"./lifecycle.mjs",
	];
	const hashes = await Promise.all(
		files.map(async (name) => [
			name,
			createHash("sha256")
				.update(await readFile(new URL(name, import.meta.url)))
				.digest("hex"),
		]),
	);
	const publishedMetadata = JSON.parse(
		await readFile(
			new URL(
				"../published/node_modules/@nilejs/nile/package.json",
				import.meta.url,
			),
			"utf8",
		),
	);
	const names = Object.keys(publishedMetadata.dependencies);
	const resolved = async (prefix) =>
		Object.fromEntries(
			await Promise.all(
				names.map(async (name) => {
					const pkg = JSON.parse(
						await readFile(
							new URL(`${prefix}/${name}/package.json`, import.meta.url),
							"utf8",
						),
					);
					return [name, pkg.version];
				}),
			),
		);
	return {
		bun: process.versions.bun,
		hashes: Object.fromEntries(hashes),
		publishedResolvedDependencies: await resolved("../published/node_modules"),
		currentResolvedDependencies: await resolved(
			"../../../../nile/node_modules",
		),
		publishedMetadata,
	};
}
await mkdir(directory, { recursive: true });
const frozen = await provenance();

/** Keep all completed samples and explicit failure metadata; never count an invalid workload as fast throughput. */
async function persist(completed = false, failure = undefined) {
	const report = {
		completed,
		failure,
		timestamp: new Date().toISOString(),
		elapsedMs: performance.now() - started,
		rounds,
		entries: ENTRIES,
		validationModes: ["plain", "validated"],
		actionCount: 300,
		concurrency: 32,
		warmupJourneys: WARMUP,
		measuredJourneys: JOURNEYS,
		requestsPerJourney: 6,
		provenance: frozen,
		rows,
		summary: smoke ? {} : summarize(rows),
		methodology:
			"All three contenders complete each round before next round. Rotated contender order and alternating validation-mode order. Both npm/current execute on the same Bun runtime, separate fresh application/client processes, same authenticated300-operation ecommerce workload, same Zodschemas and expected responses. Current Hono is a control; published has no native adapter. Default published runtime package is not patched. Dependency resolutions and artifact hashes retained.",
	};
	await writeFile(
		new URL(smoke ? "admission.json" : "results.json", directory),
		`${JSON.stringify(report, null, 2)}\n`,
	);
}

/** Run all routes and security guards before measuring matched shopping journeys. */
async function measure(framework, mode, round) {
	scenario = { framework, runtime: "bun", mode, round };
	const plans = smoke ? [] : prepareJourneys(framework, JOURNEYS, "measure");
	const warmup = smoke ? [] : prepareJourneys(framework, WARMUP, "warmup");
	const server = startServer(framework, mode);
	active = server;
	const result = await safeTry(async () => {
		const connection = await server.ready;
		await checkFullAdmission(connection, framework, mode);
		const admitted = await control(server, "metrics");
		if (admitted.state.orders !== 50 || admitted.state.carts !== 0) {
			throw new Error("Admission state mismatch");
		}
		await control(server, "reset");
		if (smoke) {
			return { ...scenario, admissionPassed: true };
		}
		await runLoad(connection, warmup);
		const before = await control(server, "reset");
		if (before.state.orders || before.state.carts) {
			throw new Error("Reset mismatch");
		}
		const hostBefore = snapshotHost();
		const metrics = await runLoad(connection, plans);
		const hostAfter = snapshotHost();
		const after = await control(server, "metrics");
		if (after.state.orders !== JOURNEYS || after.state.carts !== 0) {
			throw new Error("Measured state mismatch");
		}
		return {
			...scenario,
			...metrics,
			state: after.state,
			serverCpuMs:
				(after.resource.userCPUTime +
					after.resource.systemCPUTime -
					before.resource.userCPUTime -
					before.resource.systemCPUTime) /
				1000,
			serverRssBytes: after.memory.rss,
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
		`${rows.length}/${(smoke ? 1 : rounds) * ENTRIES.length * 2} round${round} ${framework}/${mode}: ${smoke ? "admission passed" : `${Math.round(result.value.requestsPerSecond)}req/s`}`,
	);
}

/** Complete short interleaved artifact comparisons, saving progress and closing every owned application. */
async function run() {
	console.log(`Evidence: ${fileURLToPath(directory)}`);
	const heartbeat = setInterval(
		() =>
			console.log(
				JSON.stringify({ completedScenarios: rows.length, active: scenario }),
			),
		20_000,
	);
	const deadline = setTimeout(async () => {
		if (active) {
			await stopServer(active);
		}
		await persist(false, "Ten-minute budget exceeded");
		process.exit(1);
	}, 600_000);
	const shutdown = async () => {
		if (active) {
			await stopServer(active);
		}
		await persist(false, "Interrupted");
		process.exit(1);
	};
	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
	const result = await safeTry(async () => {
		for (const round of Array.from(
			{ length: smoke ? 1 : rounds },
			(_, index) => index + 1,
		)) {
			const offset = (round - 1) % ENTRIES.length;
			const order = [...ENTRIES.slice(offset), ...ENTRIES.slice(0, offset)];
			for (const framework of order) {
				for (const mode of round % 2
					? ["plain", "validated"]
					: ["validated", "plain"]) {
					await measure(framework, mode, round);
					await persist();
				}
			}
		}
	});
	clearInterval(heartbeat);
	clearTimeout(deadline);
	if (active) {
		await stopServer(active);
	}
	await persist(result.isOk, result.isErr ? String(result.error) : undefined);
	if (result.isErr) {
		console.error(result.error);
		process.exitCode = 1;
	} else {
		console.log("Published/current comparison complete");
	}
}
await run();
