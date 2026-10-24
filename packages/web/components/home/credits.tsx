import { CircleDot, GitPullRequest } from "lucide-react";
import { withBase } from "./links";

const REPOSITORY_URL = "https://github.com/nile-js/nile";

/** Open source projects Nile Js is built on. Logos come from svgl.app. */
const CREDITS = [
	{ name: "Bun", logo: "bun.svg", href: "https://bun.sh" },
	{
		name: "TypeScript",
		logo: "typescript.svg",
		href: "https://www.typescriptlang.org",
	},
	{ name: "Node.js", logo: "nodejs.svg", href: "https://nodejs.org" },
	{ name: "Zod", logo: "zod.svg", href: "https://zod.dev" },
	{ name: "Hono", logo: "hono.svg", href: "https://hono.dev" },
	{
		name: "Drizzle ORM",
		logo: "drizzle.svg",
		href: "https://orm.drizzle.team",
	},
	{ name: "Socket.IO", logo: "socketio.svg", href: "https://socket.io" },
] as const;

/** Thank the projects that make Nile Js possible, then invite contributions. */
export function Credits() {
	return (
		<section
			className="nile-section nile-credits"
			aria-labelledby="credits-title"
		>
			<header className="nile-heading nile-heading-center" data-reveal>
				<h2 id="credits-title">Made Possible By Open Source.</h2>
				<p>
					Nile Js stands on these projects. Thank you to everyone who builds and
					maintains them.
				</p>
			</header>
			<ul className="nile-credits-list">
				{CREDITS.map((credit) => (
					<li key={credit.name} data-reveal>
						<a href={credit.href}>
							<img
								src={withBase(`/images/credits/${credit.logo}`)}
								alt=""
								width={44}
								height={44}
								loading="lazy"
								decoding="async"
							/>
							<span>{credit.name}</span>
						</a>
					</li>
				))}
			</ul>
			<div className="nile-contribute" data-reveal>
				<div>
					<h3>Help shape Nile Js.</h3>
					<p>
						Nile Js is open source under the MIT license. Report an issue,
						improve the docs or send a pull request. Every contribution helps
						the next team ship.
					</p>
				</div>
				<div className="nile-contribute-actions">
					<a
						className="nile-button"
						href={`${REPOSITORY_URL}/blob/main/CONTRIBUTING.md`}
					>
						<GitPullRequest size={18} aria-hidden="true" />
						Contribute on GitHub
					</a>
					<a className="nile-text-link" href={`${REPOSITORY_URL}/issues`}>
						<CircleDot size={16} aria-hidden="true" />
						Open issues
					</a>
				</div>
			</div>
		</section>
	);
}
