import { withBase } from "./links";

const OUTCOMES = [
	{
		number: "01",
		title: "Know what failure looks like.",
		situation:
			"When an operation cannot complete, the next developer should be able to follow why.",
		detail:
			"Results make expected failures explicit. Zod schemas check action inputs before the handler. A configured logger gives failures useful context.",
		link: "/guide/basics/errors-and-results",
		label: "Follow a failure through the application",
	},
	{
		number: "02",
		title: "Connect a resource once.",
		situation:
			"Your database, logger and integrations need a consistent way into the work.",
		detail:
			"Supply shared resources through Nile's application context. Keep request identity in its isolated session and your business functions focused on their inputs.",
		link: "/guide/basics/context",
		label: "See how context fits together",
	},
	{
		number: "03",
		title: "Keep the policy in one place.",
		situation:
			"The next operation should not need another copy of the same access rules.",
		detail:
			"Use shared hooks to resolve your chosen authentication, enforce roles and compose behavior around actions. Your application defines the policy.",
		link: "/guide/basics/hooks-and-pipelines",
		label: "Compose hooks around the work",
	},
] as const;

/** Describe each capability through the recurring team problem it helps solve. */
export function TeamOutcomes() {
	return (
		<section className="nile-section" aria-labelledby="outcomes-title">
			<div className="nile-section-heading">
				<p className="nile-eyebrow">Less to rediscover with every change</p>
				<h2 id="outcomes-title">
					Keep the routine
					<br />
					work predictable.
				</h2>
			</div>
			<div className="nile-outcomes">
				{OUTCOMES.map((item) => (
					<article key={item.number}>
						<span className="nile-outcome-number">{item.number}</span>
						<div>
							<h3>{item.title}</h3>
							<p className="nile-outcome-situation">{item.situation}</p>
						</div>
						<div>
							<p>{item.detail}</p>
							<a className="nile-text-link" href={withBase(item.link)}>
								{item.label} <span aria-hidden="true">↗</span>
							</a>
						</div>
					</article>
				))}
			</div>
		</section>
	);
}
