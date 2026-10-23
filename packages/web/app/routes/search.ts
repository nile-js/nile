import { createFromSource } from "fumadocs-core/search/server";
import { source } from "../lib/source";

const search = createFromSource(source);

/** Export the search index at build time for static hosting. */
export function loader() {
	return search.staticGET();
}
