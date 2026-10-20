#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { lstat, mkdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkEncore, prepareEncore } from "./setup-encore.mjs";

const SUITE = dirname(fileURLToPath(import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const ENCORE = join(SUITE, "ecommerce/full/encore");
const CHECK_ONLY = process.argv.includes("--check");
const children = new Set();

/** Forward cancellation only to commands launched by this invocation. */
function stopChildren(signal) {
	for (const child of children) {
		child.kill(signal);
	}
	process.exitCode = signal === "SIGINT" ? 130 : 143;
}

process.once("SIGINT", () => stopChildren("SIGINT"));
process.once("SIGTERM", () => stopChildren("SIGTERM"));

/** Bootstrap safely before Slang itself has been installed. */
function safeTry(operation) {
	return Promise.resolve()
		.then(operation)
		.then(
			(data) => ({ status: true, data }),
			(error) => ({ status: false, message: error.message }),
		);
}

/** Run an exact argument list without a shell or implicit package downloads. */
async function run(command, args, cwd = SUITE, capture = false) {
	const child = Bun.spawn([command, ...args], {
		cwd,
		stdin: "ignore",
		stdout: capture ? "pipe" : "inherit",
		stderr: "inherit",
	});
	children.add(child);
	const output = capture
		? new Response(child.stdout).text()
		: Promise.resolve("");
	const timeout = setTimeout(() => child.kill("SIGKILL"), 600_000);
	const code = await child.exited;
	clearTimeout(timeout);
	children.delete(child);
	if (code !== 0) {
		throw new Error(`${command} ${args.join(" ")} exited with ${code}`);
	}
	return (await output).trim();
}

/** Reject unsupported hosts before installing or building anything. */
async function checkPrerequisites() {
	if (process.platform !== "linux" || process.arch !== "x64") {
		throw new Error(
			"The complete matrix currently requires Linux x64 (Encore uses Docker host networking).",
		);
	}
	for (const name of ["bun", "node", "docker", "tar"]) {
		if (!Bun.which(name)) {
			throw new Error(`Required executable missing: ${name}`);
		}
	}
	const nodeVersion = await run("node", ["--version"], SUITE, true);
	const [major, minor] = nodeVersion.slice(1).split(".").map(Number);
	const supportsNode =
		major >= 26 ||
		(major === 24 && minor >= 11) ||
		(major === 22 && minor >= 18);
	if (!supportsNode) {
		throw new Error(
			`Node ${nodeVersion} is unsupported; use Node 22.18+, 24.11+, or 26+.`,
		);
	}
	await run("docker", ["info", "--format", "{{.ServerVersion}}"], SUITE, true);
	console.log(`Bun ${Bun.version}; Node ${nodeVersion}; Docker available.`);
}

/** Preserve the old activity-era symlink rather than deleting its contents. */
async function detachLegacyDependencies() {
	const path = join(ENCORE, "node_modules");
	const entry = await safeTry(() => lstat(path));
	if (!(entry.status && entry.data.isSymbolicLink())) {
		return;
	}
	const destination = join(
		ROOT,
		"trash/release-1.0-cleanup",
		`encore-node-modules-link-${Date.now()}`,
	);
	await mkdir(dirname(destination), { recursive: true });
	await rename(path, destination);
	console.log(
		"Preserved the previous Encore dependency symlink in the project trash folder.",
	);
}

/** Prepare the actual ten-framework fixtures without starting benchmark servers. */
async function setupBenchmark() {
	await checkPrerequisites();
	if (CHECK_ONLY) {
		for (const path of [
			"node_modules/slang-ts/package.json",
			"ecommerce/full/encore/node_modules/encore.dev/package.json",
			"../../nile/dist/index.js",
			"ecommerce/published/node_modules/@nilejs/nile/package.json",
		]) {
			const absolute = join(SUITE, path);
			if (!existsSync(absolute)) {
				throw new Error(`Setup output missing: ${absolute}`);
			}
		}
		await checkEncore({ run, suite: SUITE });
		console.log(
			"Benchmark prerequisites, dependencies, Nile build, and Encore image are present.",
		);
		return;
	}
	await run("bun", ["install", "--frozen-lockfile", "--ignore-scripts"], ROOT);
	await run("bun", ["run", "build"], join(ROOT, "packages/nile"));
	await run("bun", ["install", "--frozen-lockfile", "--ignore-scripts"], SUITE);
	await run(
		"bun",
		["install", "--frozen-lockfile", "--ignore-scripts"],
		join(SUITE, "ecommerce/published"),
	);
	await detachLegacyDependencies();
	await run(
		"bun",
		["install", "--frozen-lockfile", "--ignore-scripts"],
		ENCORE,
	);
	await prepareEncore({ run, suite: SUITE, app: ENCORE });
	console.log(
		"Setup complete. From this folder: bun ecommerce/full/run.mjs --smoke",
	);
	console.log("For measurements: bun ecommerce/full/run.mjs --rounds=6");
}

const result = await safeTry(setupBenchmark);
if (!result.status) {
	console.error(`Benchmark setup failed: ${result.message}`);
	process.exitCode = 1;
}
