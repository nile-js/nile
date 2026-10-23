import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { withBase } from "./site";

/** Share the public navigation between the homepage and documentation. */
export function layoutOptions(): BaseLayoutProps {
	return {
		themeSwitch: { enabled: false },
		nav: {
			url: withBase("/"),
			title: (
				<span className="nile-brand">
					<img src={withBase("/nile-logo.svg")} alt="" width={30} height={30} />
					Nile Js
				</span>
			),
		},
		links: [
			{
				text: "Documentation",
				url: withBase("/guide/start/getting-started"),
				active: "nested-url",
			},
			{
				text: "Features",
				url: withBase("/#features"),
				active: "none",
			},
			{
				text: "Examples",
				url: withBase("/guide/examples"),
				active: "nested-url",
			},
			{
				text: "Performance",
				url: withBase("/guide/reference/performance"),
				active: "url",
			},
		],
		githubUrl: "https://github.com/nile-js/nile",
	};
}
