import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { resolveSiteLocation } from "../site.config";

const { basePath } = resolveSiteLocation(process.env);
const root = resolve(`doc_build/client${basePath}`);
const types: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript",
	".css": "text/css",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".webp": "image/webp",
	".avif": "image/avif",
	".xml": "application/xml; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".md": "text/markdown; charset=utf-8",
	".woff2": "font/woff2",
	".otf": "font/otf",
	".ttf": "font/ttf",
};

/** Keep expected missing paths graceful without masking configuration failures. */
function safeTry<T>(fn: () => Promise<T>) {
	return Promise.resolve()
		.then(fn)
		.then(
			(data) => ({ status: true as const, data }),
			() => ({ status: false as const, message: "Page not found" }),
		);
}

createServer(async (request, response) => {
	const parsed = await safeTry(async () =>
		decodeURIComponent(
			new URL(request.url ?? "/", "http://localhost").pathname,
		),
	);
	if (!parsed.status) {
		response.writeHead(400);
		response.end("Invalid address");
		return;
	}
	const pathname = parsed.data;
	if (basePath !== "" && pathname === basePath) {
		response.writeHead(301, { Location: `${basePath}/` });
		response.end();
		return;
	}
	const insideBase =
		basePath !== "" &&
		(pathname === basePath || pathname.startsWith(`${basePath}/`));
	const sitePath = insideBase ? pathname.slice(basePath.length) : pathname;
	const path = resolve(root, `.${sitePath}`);
	if (!(path === root || path.startsWith(`${root}${sep}`))) {
		response.writeHead(404);
		response.end();
		return;
	}
	const result = await safeTry(async () => {
		const target = (await stat(path)).isDirectory()
			? resolve(path, "index.html")
			: path;
		return {
			body: await readFile(target),
			type: types[extname(target)] ?? "application/octet-stream",
		};
	});
	if (result.status) {
		response.writeHead(200, { "Content-Type": result.data.type });
		response.end(result.data.body);
		return;
	}
	const missing = await safeTry(() => readFile(resolve(root, "404.html")));
	response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
	response.end(missing.status ? missing.data : result.message);
}).listen(4173, "127.0.0.1", () =>
	console.info(`Nile Js preview: http://127.0.0.1:4173${basePath}/`),
);
