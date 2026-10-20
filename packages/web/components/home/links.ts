export const BASE_PATH = "/nile";

/** Keep custom landing links on the same GitHub Pages base as the docs. */
export function withBase(path: string): string {
	return `${BASE_PATH}${path}`;
}
