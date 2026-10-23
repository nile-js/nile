import { SITE_URL, withBase } from "../lib/site";
import { source } from "../lib/source";

/** Publish an index with absolute links for assistants outside the website. */
export function loader() {
	const pages = source
		.getPages()
		.map(
			(page) =>
				`- [${page.data.title}](${SITE_URL}${page.url}): ${page.data.description ?? ""}`,
		);
	return new Response(
		[
			"# Nile Js",
			"",
			"A functional TypeScript backend for small teams.",
			"",
			`Full text: ${SITE_URL}${withBase("/llms-full.txt")}`,
			"",
			"## Guides",
			"",
			...pages,
		].join("\n"),
		{ headers: { "Content-Type": "text/plain; charset=utf-8" } },
	);
}
