import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { absoluteUrl } from "../app/lib/site";
import { resolveSiteLocation } from "../site.config";
import { writeLegacyDocLinks } from "./legacy-doc-links";
import { writeSitemap } from "./sitemap";

const { basePath } = resolveSiteLocation(process.env);
const client = "doc_build/client";
// React Router writes pre-rendered pages under the base path; Vite writes assets at the client root.
const output = basePath === "" ? client : join(client, basePath);

/** Bring Vite's root-level assets next to the pages when the site lives under a base path. */
async function collectClientFiles(): Promise<void> {
	if (basePath === "") {
		return;
	}
	const baseDirectory = basePath.split("/")[1];
	await mkdir(output, { recursive: true });
	const entries = await readdir(client);
	await Promise.all(
		entries
			// Public copies are from the previous build; keep the freshly rendered resources.
			.filter(
				(name) =>
					![
						baseDirectory,
						"__spa-fallback.html",
						"llms.txt",
						"llms-full.txt",
					].includes(name),
			)
			.map((name) =>
				cp(join(client, name), join(output, name), { recursive: true }),
			),
	);
}

/** Package the static site for any static host, at a domain root or under a base path. */
async function finalizeBuild(): Promise<void> {
	await collectClientFiles();
	await writeSitemap(output);
	await writeFile(
		join(output, "robots.txt"),
		`User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`,
	);
	const bundle = await readFile(join(output, "llms-full.txt"), "utf8");
	const markdownFiles = (
		await readdir(join(output, "markdown"), { recursive: true })
	).filter((name) => name.endsWith("content.md"));
	await Promise.all(
		markdownFiles.map(async (name) => {
			const text = await readFile(join(output, "markdown", name), "utf8");
			if (!bundle.includes(text))
				throw new Error(
					`Assistant bundle is missing the current guide: ${name}`,
				);
		}),
	);
	await writeLegacyDocLinks(output);
	await cp(join(output, "404", "index.html"), join(output, "404.html"));
	await writeFile(join(output, ".nojekyll"), "");
	await Promise.all(
		["llms.txt", "llms-full.txt"].map(async (file) => {
			await cp(join(output, file), join("doc_build", file));
			await cp(join(output, file), join("docs/public", file));
		}),
	);
	console.info(`Static site ready in ${output}; assistant exports refreshed.`);
}

await finalizeBuild();
