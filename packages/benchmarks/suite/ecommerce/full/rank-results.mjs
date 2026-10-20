import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { safeTry } from "slang-ts";
import { CONTENDERS } from "./registry.mjs";

const LABELS = {
	"nile-native": "Nile",
	hono: "Hono",
	elysia: "Elysia",
	express: "Express",
	fastify: "Fastify",
	"nest-fastify": "NestJS",
	adonis: "AdonisJS",
	"effect-bun": "Effect",
	trpc: "tRPC",
	encore: "Encore",
};

/** Rank every declared round, refusing incomplete or inconsistent measured samples. */
function rankMode(report, mode) {
	const rows = CONTENDERS.map((entry) => {
		const samples = report.rows.filter(
			(row) => row.framework === entry.name && row.mode === mode,
		);
		if (
			samples.length !== report.rounds ||
			new Set(samples.map((row) => row.round)).size !== report.rounds ||
			samples.some(
				(row) =>
					!Number.isInteger(row.round) ||
					row.round < 1 ||
					row.round > report.rounds,
			)
		) {
			throw new Error(`Missing or duplicate rounds for ${entry.name}/${mode}`);
		}
		if (
			samples.some(
				(row) =>
					row.runtime !== entry.runtime ||
					row.journeys !== report.measuredJourneysPerScenario ||
					row.requests !==
						report.measuredJourneysPerScenario * report.operationsPerJourney ||
					row.state?.carts !== 0 ||
					row.state?.orders !== report.measuredJourneysPerScenario ||
					!Number.isFinite(row.elapsedMs) ||
					row.elapsedMs <= 0 ||
					!Number.isFinite(row.requestsPerSecond) ||
					row.requestsPerSecond <= 0 ||
					Math.abs(
						row.requestsPerSecond - (row.requests * 1000) / row.elapsedMs,
					) >
						row.requestsPerSecond * 1e-10,
			)
		) {
			throw new Error("Invalid measured sample");
		}
		const rates = samples
			.map((row) => row.requestsPerSecond)
			.sort((a, b) => a - b);
		const mean = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
		const deviation = Math.sqrt(
			rates.reduce((sum, rate) => sum + (rate - mean) ** 2, 0) / rates.length,
		);
		return {
			framework: entry.name,
			label: LABELS[entry.name],
			runtime: entry.runtime,
			samples: report.rounds,
			meanRequestsPerSecond: mean,
			medianRequestsPerSecond:
				rates.length % 2
					? rates[Math.floor(rates.length / 2)]
					: (rates[rates.length / 2 - 1] + rates[rates.length / 2]) / 2,
			minRequestsPerSecond: rates[0],
			maxRequestsPerSecond: rates.at(-1),
			coefficientOfVariationPercent: (deviation * 100) / mean,
		};
	}).sort((a, b) => b.meanRequestsPerSecond - a.meanRequestsPerSecond);
	const nile = rows.find((row) => row.framework === "nile-native");
	return rows.map((row, index) => ({
		rank: index + 1,
		...row,
		leaderThroughputDividedByThis:
			rows[0].meanRequestsPerSecond / row.meanRequestsPerSecond,
		nileBunThroughputDividedByThis:
			nile.meanRequestsPerSecond / row.meanRequestsPerSecond,
	}));
}

/** Export pairwise throughput ratios so comparisons are independent of the chosen reference framework. */
function compareRows(rows) {
	return Object.fromEntries(
		rows.map((left) => [
			left.framework,
			Object.fromEntries(
				rows.map((right) => [
					right.framework,
					left.meanRequestsPerSecond / right.meanRequestsPerSecond,
				]),
			),
		]),
	);
}

/** Render the same unambiguous ranking format for payload validation disabled and enabled. */
function renderTable(title, rows) {
	return [
		title,
		"",
		"| Rank | Framework | Average req/s | Leader ÷ this | Nile ÷ this |",
		"|---:|---|---:|---:|---:|",
		...rows.map(
			(row) =>
				`| ${row.rank} | ${row.label} | ${Math.round(row.meanRequestsPerSecond).toLocaleString("en-US")} | ${row.leaderThroughputDividedByThis.toFixed(2)}× | ${row.nileBunThroughputDividedByThis.toFixed(2)}× |`,
		),
		"",
	].join("\n");
}

/** Derive portable presentation data from an explicitly selected completed benchmark. */
async function main() {
	const [input, output, ...extra] = process.argv.slice(2);
	if (!input || extra.length) {
		throw new Error(
			"Usage: node rank-results.mjs <results.json> [output-directory]",
		);
	}
	const source = resolve(input);
	const destination = resolve(output ?? join(dirname(source), "presentation"));
	const bytes = await readFile(source);
	const original = JSON.parse(bytes);
	if (
		!((original.completed &&Array.isArray(original.rows) ) &&Number.isSafeInteger(original.rounds) ) ||
		original.rounds < 1 ||
		!Number.isSafeInteger(original.measuredJourneysPerScenario) ||
		original.measuredJourneysPerScenario < 1 ||
		!Number.isSafeInteger(original.operationsPerJourney) ||
		original.operationsPerJourney < 1
	) {
		throw new Error(
			"Source benchmark is incomplete or measurement settings are invalid",
		);
	}
	const plain = rankMode(original, "plain");
	const validated = rankMode(original, "validated");
	const sourcePath = relative(destination, source).split(sep).join("/");
	const report = {
		derivedAt: new Date().toISOString(),
		newMeasurementsRun: false,
		source: {
			path: sourcePath,
			sha256: createHash("sha256").update(bytes).digest("hex"),
			originalRounds: original.rounds,
		},
		selection:
			"One declared setup per framework: Nile, Hono, Elysia and Effect use Bun; NestJS uses Fastify on Node; Express, Fastify, AdonisJS and tRPC use Node; Encore uses its production Node+Rust image. Runtime selection is explicit; individual favorable samples are never selected.",
		method: `${original.rounds} samples per contender per mode, arithmetic mean, descending throughput. All completed samples retained. Same ${original.actionCount}-operation authenticated in-memory ecommerce workload and common Zod validation modes.`,
		limitation:
			"Observed ranking from an actively used PC. Ratios describe this run, not proven universal framework speed differences. Close means and overlapping ranges do not establish a reliable winner.",
		rankings: { plain, validated },
		pairwiseThroughputRatios: {
			plain: compareRows(plain),
			validated: compareRows(validated),
		},
	};
	const markdown = [
		"# Framework throughput ranking",
		"",
		`One entry per framework; all ${original.rounds} samples per setup and mode retained. No new measurements were run and no individual outliers were removed.`,
		"",
		report.selection,
		"",
		"Tables sort by arithmetic mean requests/sec. ‘Leader ÷ this’ and ‘Nile ÷ this’ are throughput ratios for this recorded workload.",
		"",
		renderTable("## Payload validation off", plain),
		renderTable("## Shared Zod payload validation on", validated),
		"## Scope",
		"",
		report.method,
		"",
		report.limitation,
		"",
		"JWT and CORS remain enabled. Validation off disables payload Zod only; Nile retains protocol-envelope checks. Every framework uses the same payload schemas. State is in memory; this is not a database benchmark. Runtime and adapter choices affect the comparison.",
		"",
		`Source: [original results](<${encodeURI(sourcePath)}>). [Machine-readable rankings and ratios](rankings.json) include ranges, medians and the exact source hash.`,
		"",
	].join("\n");
	await mkdir(destination, { recursive: true });
	await writeFile(
		join(destination, "rankings.json"),
		`${JSON.stringify(report, null, 2)}\n`,
	);
	await writeFile(join(destination, "RANKING.md"), markdown);
	console.log(join(destination, "rankings.json"));
}

const outcome = await safeTry(main);
if (outcome.isErr) {
	console.error(outcome.error);
	process.exitCode = 1;
}
