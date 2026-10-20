import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const VERSION = "1.58.6";
const IMAGE = `nile-benchmark-encore-ecommerce:${VERSION}`;
const BASE =
	"node@sha256:85e31dc0dcafd6754ca56b6abe73360f10278b38bb70153bb2b61dbb8d1c481e";
const ARCHIVE_SHA256 =
	"46add1a88eb02349e4ce51269fdade91c52e8fc044c972cc0ae40129a1eb91b2";
const ARCHIVE_URL = `https://d2f391esomvqpi.cloudfront.net/encore-${VERSION}-linux_amd64.tar.gz`;

/** Bind the image to its local Nile build and all shared benchmark inputs. */
export async function collectSourceHashes(suite) {
	const actions = (await readdir(join(suite, "ecommerce/full/encore/actions")))
		.filter((name) => name.endsWith(".ts"))
		.map((name) => `ecommerce/full/encore/actions/${name}`);
	const paths = [
		"../../nile/dist/index.js",
		"ecommerce/workload.mjs",
		"ecommerce/fixtures.mjs",
		"ecommerce/client.mjs",
		"bun.lock",
		"ecommerce/full/encore/encore.app",
		"ecommerce/full/encore/package.json",
		"ecommerce/full/encore/bun.lock",
		...actions,
	].sort();
	return Object.fromEntries(
		await Promise.all(
			paths.map(async (path) => [
				path,
				createHash("sha256")
					.update(await readFile(join(suite, path)))
					.digest("hex"),
			]),
		),
	);
}

/** Require the selected compiler version rather than silently using another release. */
async function verifyCompiler({ path, run, suite }) {
	const version = await run(path, ["version"], suite, true);
	const release = version.split(" ").at(-1);
	if (release !== VERSION && release !== `v${VERSION}`) {
		throw new Error(`Expected Encore ${VERSION}, received ${version}`);
	}
	return path;
}

/** Download a fixed official release and verify its bytes before extraction. */
async function resolveCompiler({ run, suite }) {
	const local = join(suite, "tools", `encore-${VERSION}`);
	const path = join(local, "bin/encore");
	if (existsSync(path)) {
		return verifyCompiler({ path, run, suite });
	}
	const installed = Bun.which("encore");
	if (installed) {
		const version = await run(installed, ["version"], suite, true);
		if (new RegExp(`\\b${VERSION.replaceAll(".", "\\.")}\\b`).test(version)) {
			return installed;
		}
	}
	await mkdir(local, { recursive: true });
	const archive = join(suite, "tools", `encore-${VERSION}.tar.gz`);
	if (!existsSync(archive)) {
		console.log(
			`Downloading Encore ${VERSION} from its official release host.`,
		);
		const response = await fetch(ARCHIVE_URL, {
			signal: AbortSignal.timeout(60_000),
		});
		if (!response.ok) {
			throw new Error(`Encore download failed: HTTP ${response.status}`);
		}
		await writeFile(archive, new Uint8Array(await response.arrayBuffer()));
	}
	const digest = createHash("sha256")
		.update(await readFile(archive))
		.digest("hex");
	if (digest !== ARCHIVE_SHA256) {
		throw new Error(`Encore archive checksum mismatch: ${digest}`);
	}
	await run("tar", ["-xzf", archive, "-C", local], suite);
	return verifyCompiler({ path, run, suite });
}

/** Check prepared Docker state without downloading, compiling, or launching a container. */
export async function checkEncore({ run, suite }) {
	const compiler = join(suite, "tools", `encore-${VERSION}`, "bin/encore");
	const available = existsSync(compiler) ? compiler : Bun.which("encore");
	if (!available) {
		throw new Error(`Encore ${VERSION} compiler missing; rerun bun setup.mjs.`);
	}
	await verifyCompiler({ path: available, run, suite });
	const imageId = await run(
		"docker",
		["image", "inspect", "--format", "{{.Id}}", IMAGE],
		suite,
		true,
	);
	const manifest = JSON.parse(
		await readFile(join(suite, "tools/encore-image.json"), "utf8"),
	);
	if (
		manifest.imageId !== imageId ||
		manifest.image !== IMAGE ||
		manifest.compiler !== VERSION ||
		manifest.base !== BASE
	) {
		throw new Error("Encore image metadata is stale; rerun bun setup.mjs.");
	}
	const hashes = await collectSourceHashes(suite);
	if (JSON.stringify(hashes) !== JSON.stringify(manifest.sourceSha256)) {
		throw new Error(
			"Benchmark inputs changed after the Encore image build; rerun bun setup.mjs.",
		);
	}
	console.log(`Encore image: ${imageId}`);
	return imageId;
}

/** Stop only the foreground daemon started by this setup invocation. */
async function stopOwnedDaemon(daemon) {
	if (daemon.exitCode !== null) {
		return;
	}
	daemon.kill("SIGTERM");
	await Promise.race([daemon.exited, delay(5000)]);
	if (daemon.exitCode === null) {
		daemon.kill("SIGKILL");
		await daemon.exited;
	}
}

/** Build the real production image, then release our compiler process. */
export async function prepareEncore({ run, suite, app }) {
	const compiler = await resolveCompiler({ run, suite });
	await mkdir(join(suite, "tools"), { recursive: true });
	// If a daemon already owns Encore's socket, this child exits without replacing it.
	const daemon = Bun.spawn([compiler, "daemon", "--foreground"], {
		cwd: app,
		stdin: "ignore",
		stdout: "inherit",
		stderr: "inherit",
	});
	const interrupt = () => daemon.kill("SIGTERM");
	process.once("SIGINT", interrupt);
	process.once("SIGTERM", interrupt);
	try {
		await delay(300);
		await run(compiler, ["build", "docker", IMAGE, "--base", BASE], app);
		const imageId = await run(
			"docker",
			["image", "inspect", "--format", "{{.Id}}", IMAGE],
			suite,
			true,
		);
		await writeFile(
			join(suite, "tools/encore-image.json"),
			`${JSON.stringify(
				{
					image: IMAGE,
					imageId,
					compiler: VERSION,
					base: BASE,
					sourceSha256: await collectSourceHashes(suite),
					archive: { url: ARCHIVE_URL, sha256: ARCHIVE_SHA256 },
				},
				null,
				2,
			)}\n`,
		);
	} finally {
		process.removeListener("SIGINT", interrupt);
		process.removeListener("SIGTERM", interrupt);
		await stopOwnedDaemon(daemon);
	}
}
