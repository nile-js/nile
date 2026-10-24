import {
	ArrowDownUp,
	ArrowUpRight,
	Atom,
	BookOpen,
	Bot,
	Braces,
	Code2,
	Network,
	Terminal,
} from "lucide-react";
import { withBase } from "./links";

const TOOLS = [
	{
		title: "Context7 MCP",
		description:
			"Nile Js documentation inside a coding assistant with Context7.",
		href: "https://context7.com/nile-js/nile",
		icon: BookOpen,
	},
	{
		title: "Docs for coding agents",
		description: "llms.txt and the full documentation bundle in plain text.",
		href: withBase("/llms.txt"),
		icon: Bot,
	},
	{
		title: "Nile Js CLI",
		description: "Scaffold a project, generate actions and export input types.",
		href: "https://www.npmjs.com/package/@nilejs/cli",
		icon: Terminal,
	},
	{
		title: "Nile Js client",
		description:
			"Call actions from JavaScript, with a socket client for live work.",
		href: "https://www.npmjs.com/package/@nilejs/client",
		icon: Code2,
	},
] as const;

/** Other open source libraries by the creator of Nile Js. */
const LIBRARIES = [
	{
		title: "slang-ts",
		description:
			"Option, Result, pattern matching and async helpers. The Results in Nile Js come from here.",
		href: "https://github.com/Hussseinkizz/slang",
		icon: Braces,
	},
	{
		title: "@nilejs/future",
		description:
			"Actor and task primitives for TypeScript, inspired by Erlang.",
		href: "https://github.com/nile-js/future",
		icon: Network,
	},
	{
		title: "@z-fetch/fetch",
		description: "A pragmatic wrapper around the native fetch API.",
		href: "https://z-fetch.github.io/z-fetch",
		icon: ArrowDownUp,
	},
	{
		title: "@craxjs/crax",
		description: "A lightweight React framework built on Vite.",
		href: "https://github.com/craxjs/crax",
		icon: Atom,
	},
] as const;

/** Community first, then the tools and sibling libraries around the framework. */
export function Ecosystem() {
	return (
		<section
			className="nile-section nile-ecosystem"
			aria-labelledby="ecosystem-title"
		>
			<header className="nile-heading nile-heading-center" data-reveal>
				<h2 id="ecosystem-title">
					A Small Framework.
					<br />
					Room For Your People.
				</h2>
			</header>
			<nav className="nile-eco-grid" aria-label="Nile Js community and tools">
				<a
					className="nile-eco-card nile-eco-community"
					data-reveal
					href="https://chat.whatsapp.com/K0xkSiilbVtFf3QZoA1z5Z?mode=gi_t"
				>
					<img
						className="nile-eco-whatsapp"
						src={withBase("/images/whatsapp.svg")}
						alt=""
						width={120}
						height={120}
					/>
					<h3>WhatsApp community</h3>
					<p>
						Meet other builders, ask a question and share what you are shipping.
					</p>
					<span className="nile-eco-cta">
						Join the community <ArrowUpRight size={16} aria-hidden="true" />
					</span>
				</a>
				{TOOLS.map((item) => {
					const Icon = item.icon;
					return (
						<a
							className="nile-eco-card"
							href={item.href}
							key={item.title}
							data-reveal
						>
							<span className="nile-eco-top">
								<Icon size={22} strokeWidth={1.6} aria-hidden="true" />
								<ArrowUpRight size={17} aria-hidden="true" />
							</span>
							<h3>{item.title}</h3>
							<p>{item.description}</p>
						</a>
					);
				})}
			</nav>
			<h3 className="nile-eco-subtitle" data-reveal>
				More libraries by the creator of Nile Js
			</h3>
			<nav className="nile-eco-libraries" aria-label="Related libraries">
				{LIBRARIES.map((library) => {
					const Icon = library.icon;
					return (
						<a
							className="nile-eco-card nile-eco-library"
							href={library.href}
							key={library.title}
							data-reveal
						>
							<span className="nile-eco-top">
								<Icon size={20} strokeWidth={1.6} aria-hidden="true" />
								<ArrowUpRight size={17} aria-hidden="true" />
							</span>
							<h3>
								<code>{library.title}</code>
							</h3>
							<p>{library.description}</p>
						</a>
					);
				})}
			</nav>
		</section>
	);
}
