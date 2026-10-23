import { getPageText, source } from "../lib/source";

/** Build the full assistant bundle from the same compiled guides readers see. */
export async function loader() {
	const pages = await Promise.all(source.getPages().map(getPageText));
	return new Response(pages.join("\n\n---\n\n"), {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
