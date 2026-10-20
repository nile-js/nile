import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { cpus, loadavg, totalmem, freemem } from "node:os";
import { CONCURRENCY, JOURNEYS, WARMUP } from "../client.mjs";
import { NODE_VERSION } from "./lifecycle.mjs";
import { CONTENDERS } from "./registry.mjs";

/** Record contention without pausing or changing the user's other processes. */
export function snapshotHost() {
	const counters = cpus().reduce(
		(sum, cpu) => ({
			idle: sum.idle + cpu.times.idle,
			total: sum.total + Object.values(cpu.times).reduce((a, b) => a + b, 0),
		}),
		{ idle: 0, total: 0 },
	);
	return {
		load: loadavg(),
		freeMemoryBytes: freemem(),
		totalMemoryBytes: totalmem(),
		...counters,
	};
}

/** Keep every round, reporting arithmetic means and variation rather than selecting favorable repeats. */
export function summarize(rows) {
	return Object.fromEntries(
		Object.entries(
			Object.groupBy(rows, (row) => `${row.framework}/${row.mode}`),
		).map(([name, values]) => {
			const rates = values.map((row) => row.requestsPerSecond);
			const mean = rates.reduce((a, b) => a + b, 0) / values.length;
			const variance =
				rates.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
				rates.length;
			return [
				name,
				{
					samples: values.length,
					runtime: values[0].runtime,
					meanRequestsPerSecond: mean,
					meanJourneysPerSecond: mean / 6,
					minRequestsPerSecond: Math.min(...rates),
					maxRequestsPerSecond: Math.max(...rates),
					coefficientOfVariationPercent: (Math.sqrt(variance) * 100) / mean,
					spreadPercent:
						((Math.max(...rates) - Math.min(...rates)) * 100) / mean,
					meanJourneyP95Ms:
						values.reduce((sum, row) => sum + row.journeyP95Ms, 0) /
						values.length,
					meanRequestP95Ms:
						values.reduce((sum, row) => sum + row.requestP95Ms, 0) /
						values.length,
				},
			];
		}),
	);
}

/** Freeze hashes of the current build, common workload and all hand-authored benchmark modules before measurements. */
export async function provenance() {
	const modules = (await readdir(new URL("./", import.meta.url)))
		.filter((name) => name.endsWith(".mjs"))
		.map((name) => `./${name}`);
	const files = [
		"../../../../nile/dist/index.js",
		"../../../../nile/package.json",
		"../../../../../bun.lock",
		"../../package.json",
		"../../bun.lock",
		"./adonis/package.json",
		"./adonis/adonisrc.js",
		"./adonis/config/app.js",
		"./adonis/config/bodyparser.js",
		"./adonis/config/encryption.js",
		"./adonis/config/logger.js",
		"../workload.mjs",
		"../fixtures.mjs",
		"../client.mjs",
		...modules,
	];
	const hashes = await Promise.all(
		files.map(async (name) => [
			name,
			createHash("sha256")
				.update(await readFile(new URL(name, import.meta.url)))
				.digest("hex"),
		]),
	);
	const pkg = JSON.parse(
		await readFile(new URL("../../package.json", import.meta.url), "utf8"),
	);
	const image = JSON.parse(
		await readFile(
			new URL("../../tools/encore-image.json", import.meta.url),
			"utf8",
		),
	);
	const imageId = execFileSync(
		"docker",
		["image", "inspect", "--format", "{{.Id}}", image.image],
		{ encoding: "utf8", timeout: 15_000 },
	).trim();
	if (imageId !== image.imageId) {
		throw new Error("Encore image changed; rerun benchmark setup");
	}
	await Promise.all(
		Object.entries(image.sourceSha256).map(async ([name, expected]) => {
			const actual = createHash("sha256")
				.update(await readFile(new URL(`../../${name}`, import.meta.url)))
				.digest("hex");
			if (actual !== expected) {
				throw new Error(
					`Encore build input changed: ${name}; rerun benchmark setup`,
				);
			}
		}),
	);
	const nilePackage = JSON.parse(
		await readFile(
			new URL("../../../../nile/package.json", import.meta.url),
			"utf8",
		),
	);
	return {
		nileVersion: nilePackage.version,
		bun: process.versions.bun,
		node: NODE_VERSION,
		clientRuntime: "bun",
		host: {
			cpu: cpus()[0].model,
			logicalCpus: cpus().length,
			totalMemoryBytes: totalmem(),
		},
		dependencies: pkg.dependencies,
		hashes: Object.fromEntries(hashes),
		encore: image,
	};
}

/** Persist partial evidence after every scenario so an interruption never loses completed measurements. */
export async function saveReport({
	directory,
	rows,
	rounds,
	started,
	frozen,
	completed = false,
	failure,
}) {
	const report = {
		completed,
		failure,
		timestamp: new Date().toISOString(),
		elapsedMs: performance.now() - started,
		rounds,
		contenders: CONTENDERS,
		concurrency: CONCURRENCY,
		measuredJourneysPerScenario: JOURNEYS,
		warmupJourneysPerScenario: WARMUP,
		operationsPerJourney: 6,
		actionCount: 300,
		provenance: frozen,
		methodology: `${rounds} complete interleaved rounds across ${CONTENDERS.length} contenders, one strongest measured native runtime per framework, with no duplicate Nile variant, rotation stride 3 and alternating mode order. Each scenario starts a fresh server, admits all 300 routes/JWT/CORS/Zod, resets, warms 500 six-step journeys, resets, measures 5000 journeys, verifies 5000 orders/0 carts. Separate server/client processes, native framework HTTP stack, common JWT verifier and payload schemas. No affinity/quota for any contender.`,
		limitations: [
			"In-memory carts/orders; no database, persistence, network payment gateway or inventory locking",
			"Active personal desktop; background contention recorded but uncontrolled; client and server share host",
			"300 business routes represent50shops x6operations; Nile single endpoint dispatches300actions",
			"Plain disables payload Zod only; Nile retains protocol envelope validation",
			"tRPC uses native procedure paths and response/error envelopes",
			"Encore has one extra authenticated coordinator-only route; CPU/memory omitted because launcher is outside real application container",
			"One selected native runtime per framework; rank by measured throughput, with observed ratios and variability",
		],
		rows,
		summary: summarize(rows),
	};
	await mkdir(directory, { recursive: true });
	await writeFile(
		new URL("results.json", directory),
		`${JSON.stringify(report, null, 2)}\n`,
	);
	return report;
}
