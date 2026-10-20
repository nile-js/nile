/** Attribute production experience to the people building Nile, without invented endorsements. */
export function ProductionStory() {
	return (
		<section className="nile-story nile-section" aria-labelledby="story-title">
			<div className="nile-section-heading">
				<p className="nile-eyebrow">Built alongside the products we ship</p>
				<h2 id="story-title">
					More to build.
					<br />
					Still a small team.
				</h2>
			</div>
			<div className="nile-story-main">
				<p className="nile-story-statement">
					Our fintech backend has <strong>over 500 actions.</strong> We keep
					adding more, and we still know where things belong.
				</p>
				<p>
					We think in services and business operations. When a change comes in,
					we know which domain to open and which action to follow. The same
					structure helps the coding agents working alongside us.
				</p>
				<span className="nile-attribution">From the team building Nile</span>
			</div>
			<div className="nile-story-notes">
				<article>
					<span className="nile-small-label">Internal Back Office</span>
					<h3>
						Shipped in days.
						<br />
						Built to keep growing.
					</h3>
					<p>
						Projects, workflows, tickets and time tracking. Our internal tool
						now organizes 78 actions into 15 services, each following a familiar
						pattern.
					</p>
				</article>
				<article>
					<span className="nile-small-label">Wi-Fi billing</span>
					<h3>
						Everyday business.
						<br />
						Real requests.
					</h3>
					<p>
						We also use Nile in a Wi-Fi billing system receiving thousands of
						requests a day. Practical work shaped the framework.
					</p>
				</article>
			</div>
		</section>
	);
}
