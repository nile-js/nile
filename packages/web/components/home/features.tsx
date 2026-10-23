import { ArrowUpRight } from "lucide-react";
import { examples } from "../../home-code-blocks";
import { CodePanel } from "./code-panel";
import { FEATURES } from "./feature-catalog";
import { withBase } from "./links";

/** Keep the feature story concrete: every card carries a visible example and its guide. */
export function Features() {
	return (
		<section
			className="nile-section nile-features"
			id="features"
			aria-labelledby="features-title"
		>
			<header className="nile-heading nile-heading-split" data-reveal>
				<div>
					<h2 id="features-title">Built-in features</h2>
				</div>
				<p>
					The pieces a small backend team reaches for. Use only what your
					application needs.
				</p>
			</header>
			<div className="nile-bento">
				{FEATURES.map((feature) => {
					const Icon = feature.icon;
					return (
						<article
							key={feature.key}
							className={`nile-card nile-card-${feature.size}`}
							data-tone={feature.tone}
							data-reveal
						>
							<div className="nile-card-copy">
								<span className="nile-drop" aria-hidden="true">
									<Icon size={20} strokeWidth={1.75} />
								</span>
								<h3>{feature.title}</h3>
								<p>{feature.description}</p>
								<a
									className="nile-card-guide"
									href={withBase(feature.guide)}
									aria-label={`Read the guide: ${feature.title}`}
								>
									Read the guide
									<ArrowUpRight size={15} aria-hidden="true" />
								</a>
							</div>
							<CodePanel example={examples[feature.key]} />
						</article>
					);
				})}
			</div>
			<p className="nile-footnote">
				Snippets reference your own config and modules. In-memory queues, quotas
				and schedules work within one process; use an external system for
				durable or cross-process coordination.
			</p>
		</section>
	);
}
