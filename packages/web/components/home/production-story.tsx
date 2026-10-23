import { withBase } from "./links";

const STATS = [
	{ value: "1000+", label: "actions in real world systems" },
	{ value: "2 years", label: "in production" },
	{ value: "1000s", label: "of requests per day across services" },
] as const;

/** The creator's own account of why Nile Js exists, beside the portrait. */
export function ProductionStory() {
	return (
		<section className="nile-section nile-story" aria-labelledby="story-title">
			<div className="nile-story-layout">
				<figure className="nile-founder" data-reveal="left">
					<div className="nile-founder-photo">
						<img
							src={withBase("/me-plain.jpg")}
							alt="Hussein Kizza"
							width={540}
							height={677}
							loading="lazy"
						/>
					</div>
					<figcaption>
						<strong>Hussein Kizza</strong>
						<span>Creator of Nile Js</span>
					</figcaption>
				</figure>
				<div className="nile-story-body" data-reveal="right">
					<h2 id="story-title">
						More to ship,
						<br />
						but still a small team.
					</h2>
					<blockquote className="nile-story-quote">
						<p>
							I needed something easy to work with as a solo engineer, in a
							small team and alongside AI agents, where the right thing is
							obvious and easy to do, with maximum predictability of what goes
							where and each domain owning its concerns. It had to be lazy and
							boring, with no fighting over or deciding how to name endpoints,
							so that I could focus on the business and what I need to do rather
							than framework plumbing. That is how Nile Js was born.
						</p>
						<p>
							Now my team and I use it for all our systems. We think in services
							and business operations. When a change comes in, we know which
							domain to open and which action to follow. Error handling, logs
							and data validation are first class, so we can sleep well while
							serving real-world users.
						</p>
					</blockquote>
					<dl className="nile-story-stats">
						{STATS.map((stat) => (
							<div key={stat.value} data-reveal>
								<dt>{stat.value}</dt>
								<dd>{stat.label}</dd>
							</div>
						))}
					</dl>
				</div>
			</div>
		</section>
	);
}
