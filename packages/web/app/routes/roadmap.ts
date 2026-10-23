import { redirect } from "react-router";

/** Preserve existing bookmarks while keeping proposals in the issue tracker. */
export function loader() {
	return redirect("https://github.com/nile-js/nile/issues");
}

/** Mark this as a document route so static rendering writes redirect HTML. */
export default function RoadmapRedirect() {
	return null;
}
