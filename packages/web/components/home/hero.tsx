import { examples, installRaw } from "../../home-code-blocks";
import { CodePanel } from "./code-panel";
import { CopyButton } from "./copy-button";
import { withBase } from "./links";

/** Lead with the team's outcome, then make the programming model visible immediately. */
export function Hero() {
	return (
		<section className="nile-hero" aria-labelledby="hero-title">
			<div className="nile-hero-copy">
				<p className="nile-eyebrow">
					<span className="nile-status-dot" /> A functional TypeScript backend
					for small teams
				</p>
				<h1 id="hero-title">
					Keep shipping as your <span>backend grows.</span>
				</h1>
				<p className="nile-lead">
					Build around your business. Nile gives services and actions a familiar
					home, so your team can keep adding features without losing its way.
				</p>
				<div className="nile-actions">
					<a
						className="nile-button"
						href={withBase("/guide/start/getting-started")}
					>
						Build your first service <span aria-hidden="true">↗</span>
					</a>
					<a className="nile-text-link" href="#structure">
						See how it fits together <span aria-hidden="true">↓</span>
					</a>
				</div>
				<div className="nile-install">
					<code>{installRaw}</code>
					<CopyButton text={installRaw} />
				</div>
				<p className="nile-hero-note">
					Ordinary functions. A few clear conventions. Room for your own
					choices.
				</p>
			</div>
			<div className="nile-hero-example">
				<div className="nile-example-label">
					<span>One business operation</span>
					<span>projects.create</span>
				</div>
				<CodePanel example={examples.action} />
				<p className="nile-code-caption">
					Name the work. Check its input. Return a Result.
					<br />
					This minimal example returns a project; add persistence in your model.
				</p>
			</div>
		</section>
	);
}
