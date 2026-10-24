/** A checked-in code example after build-time syntax highlighting. */
export interface CodeExample {
	file: string;
	raw: string;
	html: string;
	/** Where the code runs, shown as a label beside the file name. */
	side?: "Backend" | "Frontend" | "Agent";
	/** Marks a whole panel, such as a response, as a success or a failure. */
	tone?: "ok" | "err";
}
