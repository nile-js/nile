import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withBase } from "../app/lib/site";

/** Preserve Rspress .html bookmarks while keeping one canonical URL per guide. */
export async function writeLegacyDocLinks(output: string): Promise<void> {
	const guide = join(output, "guide");
	const entries = (await readdir(guide, { recursive: true })).filter((name) =>
		name.endsWith("/index.html"),
	);
	await Promise.all(
		entries.map(async (name) => {
			const slug = name.slice(0, -"/index.html".length);
			// Target the trailing-slash URL so a host that serves `slug.html` for `/slug` cannot loop.
			const target = withBase(
				`/guide/${slug.split("/").map(encodeURIComponent).join("/")}/`,
			);
			const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Open Nile Js documentation</title><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${target}"><link rel="canonical" href="${target}"></head><body><a href="${target}">Open documentation</a><script>location.replace(${JSON.stringify(target)} + location.hash)</script></body></html>`;
			await writeFile(join(guide, `${slug}.html`), html);
		}),
	);
}
