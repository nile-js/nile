import { Braces, Clock3, Hash, type LucideIcon } from "lucide-react";
import { PartHeader } from "./how-nile-works";
import { withBase } from "./links";

/** Runtimes and packages Nile Js builds on; projects without a published logo use a plain icon. */
const GIANTS: {
	name: string;
	href: string;
	logo?: string;
	icon?: LucideIcon;
}[] = [
	{ name: "Bun", href: "https://bun.sh", logo: "bun.svg" },
	{ name: "Node.js", href: "https://nodejs.org", logo: "nodejs.svg" },
	{
		name: "TypeScript",
		href: "https://www.typescriptlang.org",
		logo: "typescript.svg",
	},
	{ name: "Hono", href: "https://hono.dev", logo: "hono.svg" },
	{ name: "Zod", href: "https://zod.dev", logo: "zod.svg" },
	{
		name: "slang-ts",
		href: "https://www.npmjs.com/package/slang-ts",
		icon: Braces,
	},
	{ name: "Socket.IO", href: "https://socket.io", logo: "socketio.svg" },
	{ name: "Pino", href: "https://getpino.io", logo: "pino.svg" },
	{
		name: "OpenTelemetry",
		href: "https://opentelemetry.io",
		logo: "opentelemetry.svg",
	},
	{
		name: "Croner",
		href: "https://www.npmjs.com/package/croner",
		icon: Clock3,
	},
	{ name: "nanoid", href: "https://github.com/ai/nanoid", icon: Hash },
	{
		name: "Drizzle ORM",
		href: "https://orm.drizzle.team",
		logo: "drizzle.svg",
	},
];

/** One copy of the row; the duplicate keeps the loop seamless and stays out of the accessibility tree. */
function GiantList({ duplicate = false }: { duplicate?: boolean }) {
	return (
		<ul className="nile-marquee-list" aria-hidden={duplicate || undefined}>
			{GIANTS.map((giant) => {
				const Icon = giant.icon;
				return (
					<li key={giant.name}>
						<a href={giant.href} tabIndex={duplicate ? -1 : undefined}>
							{giant.logo ? (
								<img
									src={withBase(`/images/credits/${giant.logo}`)}
									alt=""
									width={28}
									height={28}
									loading="lazy"
								/>
							) : Icon ? (
								<Icon size={26} strokeWidth={1.6} aria-hidden="true" />
							) : null}
							<span>{giant.name}</span>
						</a>
					</li>
				);
			})}
		</ul>
	);
}

/** Part 6: the projects behind Nile, as one sliding row of links. */
export function BuiltOnGiants() {
	return (
		<article className="nile-part" aria-labelledby="part-giants">
			<PartHeader number="06" id="part-giants" title="Built On Giants" />
			<div className="nile-marquee" data-reveal>
				<div className="nile-marquee-track">
					<GiantList />
					<GiantList duplicate />
				</div>
			</div>
		</article>
	);
}
