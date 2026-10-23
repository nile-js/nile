import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
	MarkdownCopyButton,
} from "fumadocs-ui/layouts/docs/page";
import { use } from "react";
import { getMDXComponents } from "../components/mdx";
import { layoutOptions } from "../lib/layout";
import {
	absoluteUrl,
	OG_IMAGE_ALT,
	OG_IMAGE_HEIGHT,
	OG_IMAGE_URL,
	OG_IMAGE_WIDTH,
} from "../lib/site";
import { getMarkdownUrl, source } from "../lib/source";
import type { Route } from "./+types/docs";

/** Preload only the requested guide; missing content receives an actual 404. */
export async function loader({ params }: Route.LoaderArgs) {
	const page = source.getPage((params["*"] ?? "").split("/").filter(Boolean));
	if (!page) throw new Response("Page not found", { status: 404 });
	await page.data.preload();
	return {
		slugs: page.slugs,
		title: page.data.title,
		description: page.data.description,
	};
}

/** Build guide metadata from loader data; a missing page keeps a generic, non-indexed title. */
export const meta: Route.MetaFunction = ({ data }) => {
	if (!data) {
		return [
			{ title: "Page not found | Nile Js" },
			{ name: "description", content: "Nile Js documentation" },
			{ name: "robots", content: "noindex" },
		];
	}
	const title = `${data.title} | Nile Js`;
	const description = data.description ?? "Nile Js documentation";
	const guidePath =
		data.slugs.length === 0 ? "/guide/" : `/guide/${data.slugs.join("/")}/`;
	const url = absoluteUrl(guidePath);
	return [
		{ title: title },
		{ name: "description", content: description },
		{ tagName: "link", rel: "canonical", href: url },
		{ property: "og:type", content: "article" },
		{ property: "og:url", content: url },
		{ property: "og:title", content: title },
		{ property: "og:description", content: description },
		{ property: "og:image", content: OG_IMAGE_URL },
		{ property: "og:image:width", content: OG_IMAGE_WIDTH },
		{ property: "og:image:height", content: OG_IMAGE_HEIGHT },
		{ property: "og:image:alt", content: OG_IMAGE_ALT },
		{ name: "twitter:title", content: title },
		{ name: "twitter:description", content: description },
		{ name: "twitter:image", content: OG_IMAGE_URL },
	];
};

/** Keep navigation, contents, copy controls and Markdown downloads consistent. */
export default function Docs({ loaderData }: Route.ComponentProps) {
	const page = source.getPage(loaderData.slugs);
	if (!page) throw new Error("Pre-rendered documentation source is missing");
	const { toc } = use(page.data.load());
	const Mdx = page.data.body;
	return (
		<DocsLayout {...layoutOptions()} tree={source.getPageTree()}>
			<DocsPage toc={toc} tableOfContent={{ style: "clerk" }}>
				<div id="main-content">
					<DocsTitle>{page.data.title}</DocsTitle>
					<DocsDescription>{page.data.description}</DocsDescription>
					<div className="nile-doc-tools">
						<MarkdownCopyButton markdownUrl={getMarkdownUrl(page)} />
						<a href={getMarkdownUrl(page)}>Read Markdown ↗</a>
					</div>
					<DocsBody>
						<Mdx components={getMDXComponents()} />
					</DocsBody>
				</div>
			</DocsPage>
		</DocsLayout>
	);
}
