import { resolveSiteLocation } from "../../site.config";

// Vite and Bun both expose build-time variables on import.meta.env.
const siteLocation = resolveSiteLocation(import.meta.env);

/** Path prefix the site is served under; empty at a domain root. */
export const BASE_PATH = siteLocation.basePath;
/** Origin of the published site, used for canonical, social and sitemap URLs. */
export const SITE_URL = siteLocation.siteUrl;
export const SITE_DESCRIPTION =
	"TypeScript-first, service and actions oriented backend framework. Define actions, group them into services and keep shipping as your backend grows.";

/** Keep public assets, downloads and source URLs on the configured base path. */
export function withBase(path: string): string {
	return path.startsWith(`${BASE_PATH}/`) || path === BASE_PATH
		? path
		: `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}

/** React Router adds its basename when navigating; remove an existing prefix once. */
export function withoutBase(path: string): string {
	if (path === BASE_PATH) return "/";
	return path.startsWith(`${BASE_PATH}/`) ? path.slice(BASE_PATH.length) : path;
}

/** Absolute URL for a path under the configured site, used for canonical and social tags. */
export function absoluteUrl(path: string): string {
	return `${SITE_URL}${withBase(path)}`;
}

export const OG_IMAGE_PATH = "/og-nile.png";
export const OG_IMAGE_URL = absoluteUrl(OG_IMAGE_PATH);
export const OG_IMAGE_WIDTH = "1200";
export const OG_IMAGE_HEIGHT = "630";
export const OG_IMAGE_ALT =
	"Nile Js: TypeScript-first, service and actions oriented backend framework. Keep shipping as your backend grows.";
