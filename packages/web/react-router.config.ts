import { readdir } from "node:fs/promises";
import type { Config } from "@react-router/dev/config";
import { getSlugs } from "fumadocs-core/source";
import { resolveSiteLocation } from "./site.config";

const { basePath } = resolveSiteLocation(process.env);

export default {
	basename: `${basePath}/`,
	buildDirectory: "doc_build",
	ssr: false,
	async prerender() {
		const entries = await readdir("docs/guide", { recursive: true });
		const slugs = entries.filter((file) => /\.mdx?$/.test(file)).map(getSlugs);
		return [
			"/",
			"/404",
			"/guide/roadmap",
			"/api/search",
			"/llms.txt",
			"/llms-full.txt",
			...slugs.flatMap((parts) => [
				// The guide index has no slugs; React Router matches it as /guide, not /guide/.
				["/guide", ...parts].join("/"),
				`/markdown/${[...parts, "content.md"].join("/")}`,
			]),
		];
	},
} satisfies Config;
