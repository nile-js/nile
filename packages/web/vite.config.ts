import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { defineConfig, searchForWorkspaceRoot } from "vite";
import { resolveSiteLocation } from "./site.config";

const { basePath } = resolveSiteLocation(process.env);

export default defineConfig({
	base: `${basePath}/`,
	publicDir: "docs/public",
	server: {
		fs: {
			// Bun links packages from the repository's root store; without it the dev client cannot hydrate.
			allow: [
				searchForWorkspaceRoot(process.cwd()),
				fileURLToPath(new URL("../../node_modules", import.meta.url)),
			],
		},
	},
	plugins: [
		fumadocsMdx({ index: false, macro: { include: ["**/app/lib/source.ts"] } }),
		tailwindcss(),
		reactRouter(),
	],
});
