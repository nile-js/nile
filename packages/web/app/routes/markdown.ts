import { getPageText, source } from "../lib/source";
import type { Route } from "./+types/markdown";

/** Serve one processed guide as Markdown for copy controls and coding assistants. */
export async function loader({ params }: Route.LoaderArgs) {
	const segments = (params["*"] ?? "").split("/").filter(Boolean);
	if (segments.pop() !== "content.md")
		return new Response("Not found", { status: 404 });
	const page = source.getPage(segments);
	if (!page) return new Response("Not found", { status: 404 });
	return new Response(await getPageText(page), {
		headers: { "Content-Type": "text/markdown; charset=utf-8" },
	});
}
