import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { absoluteUrl } from "../app/lib/site";

const GUIDE_DIRECTORY = "guide";
const INDEX_SUFFIX = "/index.html";
const ROOT_INDEX = "index.html";
const SITEMAP_FILE = "sitemap.xml";
const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";
const REDIRECT_MARKER = 'http-equiv="refresh"';

/** Escape the characters that cannot appear raw inside a sitemap <loc> element. */
function escapeXml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

/**
 * Derive guide URLs from the pre-rendered output so the sitemap cannot drift from the built pages.
 * Only `guide/**` is scanned, which keeps `404` and `markdown/` outputs out by construction.
 */
export async function listGuideUrls(output: string): Promise<string[]> {
	const guideRoot = join(output, GUIDE_DIRECTORY);
	const files = await readdir(guideRoot, { recursive: true });
	const indexFiles = files
		.map((file) => file.split("\\").join("/"))
		.filter((file) => file === ROOT_INDEX || file.endsWith(INDEX_SUFFIX))
		.sort();
	const urls: string[] = [];
	for (const file of indexFiles) {
		const html = await readFile(join(guideRoot, file), "utf8");
		// Redirect-only pages, such as the former roadmap, are not content.
		if (html.includes(REDIRECT_MARKER)) {
			continue;
		}
		if (file === ROOT_INDEX) {
			urls.push(absoluteUrl(`/${GUIDE_DIRECTORY}/`));
			continue;
		}
		const slug = file.slice(0, -INDEX_SUFFIX.length);
		const encoded = slug.split("/").map(encodeURIComponent).join("/");
		urls.push(absoluteUrl(`/${GUIDE_DIRECTORY}/${encoded}/`));
	}
	return urls;
}

/** Write sitemap.xml listing the homepage and every guide page. Returns the number of URLs written. */
export async function writeSitemap(output: string): Promise<number> {
	const urls = [absoluteUrl("/"), ...(await listGuideUrls(output))];
	const entries = urls
		.map((url) => `\t<url>\n\t\t<loc>${escapeXml(url)}</loc>\n\t</url>`)
		.join("\n");
	const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="${SITEMAP_NAMESPACE}">\n${entries}\n</urlset>\n`;
	await writeFile(join(output, SITEMAP_FILE), xml);
	return urls.length;
}
