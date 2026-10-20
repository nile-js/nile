import { readFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JOURNEYS, WARMUP, CONCURRENCY } from "../client.mjs";
import { CONTENDERS } from "./registry.mjs";

/** Build the exact deterministic full-round sequence; resumed rows must be its contiguous prefix. */
function expectedSequence(rounds) {
	return Array.from({ length: rounds }, (_, index) => index + 1).flatMap(
		(round) => {
			const offset = ((round - 1) * 3) % CONTENDERS.length;
			const order = [
				...CONTENDERS.slice(offset),
				...CONTENDERS.slice(0, offset),
			];
			const modes = round % 2 ? ["plain", "validated"] : ["validated", "plain"];
			return order.flatMap((entry) =>
				modes.map((mode) => `${round}/${entry.name}/${mode}`),
			);
		},
	);
}

/** Preserve every completed result and refuse changes to application, fixtures, load generator or measurement settings. */
export async function readContinuation({ path, rounds, current }) {
	const source = pathToFileURL(resolve(path));
	const report = JSON.parse(await readFile(source, "utf8"));
	if (
		report.completed ||
		report.rounds !== rounds ||
		report.concurrency !== CONCURRENCY ||
		report.measuredJourneysPerScenario !== JOURNEYS ||
		report.warmupJourneysPerScenario !== WARMUP
	) {
		throw new Error("Incompatible or already complete resume evidence");
	}
	Object.entries(report.provenance.hashes).forEach(([name, hash]) => {
		if (name !== "./run.mjs" && current.hashes[name] !== hash) {
			throw new Error(`Resume source changed: ${name}`);
		}
	});
	if (
		JSON.stringify(report.provenance.dependencies) !==
			JSON.stringify(current.dependencies) ||
		report.provenance.bun !== current.bun ||
		report.provenance.node !== current.node ||
		report.provenance.encore.imageId !== current.encore.imageId
	) {
		throw new Error("Resume runtimes, dependencies or Encore image changed");
	}
	const sequence = expectedSequence(rounds);
	report.rows.forEach((row, index) => {
		if (
			`${row.round}/${row.framework}/${row.mode}` !== sequence[index] ||
			!Number.isFinite(row.requestsPerSecond) ||
			row.state.orders !== JOURNEYS ||
			row.state.carts !== 0
		) {
			throw new Error(`Invalid or noncontiguous completed sample ${index}`);
		}
	});
	const batch = (report.provenance.continuations?.length ?? 0) + 1;
	await copyFile(
		source,
		new URL(`results-before-continuation-${batch}.json`, source),
	);
	const continuation = {
		resumedAt: new Date().toISOString(),
		preservedSamples: report.rows.length,
		priorElapsedMs: report.elapsedMs,
		priorFailure: report.failure,
		reason:
			"Continue an interrupted run with unchanged sources, dependencies, runtimes and measurement settings; retain every completed sample",
		currentCoordinatorProvenance: current,
	};
	return {
		directory: new URL("./", source),
		rows: report.rows,
		elapsedMs: report.elapsedMs,
		frozen: {
			...report.provenance,
			continuations: [...(report.provenance.continuations ?? []), continuation],
		},
	};
}
