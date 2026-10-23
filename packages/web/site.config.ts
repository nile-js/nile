/**
 * Where the documentation site is published, resolved once at build time.
 *
 *   VITE_SITE_URL   Origin of the site, for example https://nilejs.dev.
 *                   Default: https://nile-js.github.io (GitHub Pages).
 *   VITE_BASE_PATH  Path the site is served under, for example /nile.
 *                   Use / for a site at the root of its domain. Default: /nile.
 *
 * The app, the Vite and React Router configs and the build scripts all read
 * these through this module so a domain move needs no code change.
 */
export interface SiteLocation {
	/** Origin without a trailing slash. */
	siteUrl: string;
	/** Path prefix without a trailing slash; empty when served from the domain root. */
	basePath: string;
}

const DEFAULT_SITE_URL = "https://nile-js.github.io";
const DEFAULT_BASE_PATH = "/nile";
const EDGE_SLASHES = /^\/+|\/+$/g;
const TRAILING_SLASHES = /\/+$/;

export function resolveSiteLocation(
	env: Record<string, string | undefined>,
): SiteLocation {
	const configuredUrl = env.VITE_SITE_URL?.trim();
	const siteUrl =
		configuredUrl === undefined || configuredUrl === ""
			? DEFAULT_SITE_URL
			: configuredUrl.replace(TRAILING_SLASHES, "");

	const configuredBase = env.VITE_BASE_PATH ?? DEFAULT_BASE_PATH;
	const segments = configuredBase.trim().replace(EDGE_SLASHES, "");
	const basePath = segments === "" ? "" : `/${segments}`;

	return { siteUrl: siteUrl, basePath: basePath };
}
