import { type InferPageType, loader } from "fumadocs-core/source";
import { defineDocs } from "fumadocs-mdx/macro";
import { BASE_PATH, withBase } from "./site";

export const docs = defineDocs({
	dir: "docs/guide",
	docs: {
		async: true,
		postprocess: { includeProcessedMarkdown: true },
	},
});

export const source = loader({
	source: docs.toFumadocsSource(),
	baseUrl: `${BASE_PATH}/guide`,
});

/** Public Markdown downloads use the same slugs as the human documentation. */
export function getMarkdownUrl(page: InferPageType<typeof source>): string {
	return withBase(`/markdown/${[...page.slugs, "content.md"].join("/")}`);
}

/** Reuse compiled Markdown so assistant exports follow the human documentation. */
export async function getPageText(
	page: InferPageType<typeof source>,
): Promise<string> {
	return `# ${page.data.title}\n\n${await page.data.getText("processed")}`;
}
