import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { defineConfig } from "vite";
import { resolveSiteLocation } from "./site.config";

const { basePath } = resolveSiteLocation(process.env);

export default defineConfig({
	base: `${basePath}/`,
	publicDir: "docs/public",
	plugins: [
		fumadocsMdx({ index: false, macro: { include: ["**/app/lib/source.ts"] } }),
		tailwindcss(),
		reactRouter(),
	],
});
