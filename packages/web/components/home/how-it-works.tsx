import { ArrowRight } from "lucide-react";
import { examples } from "../../home-code-blocks";
import { CodePanel } from "./code-panel";
import { withBase } from "./links";

/** Show one operation from the backend action to an ordinary React event handler. */
export function HowItWorks() {
	return (
		<section
			className="nile-section nile-how"
			id="how-it-works"
			aria-labelledby="how-title"
		>
			<header className="nile-heading nile-heading-center" data-reveal>
				<h2 id="how-title">
					TypeScript backend,
					<br />
					Any JavaScript frontend
				</h2>
			</header>
			<div className="nile-how-grid">
				<div className="nile-how-step" data-reveal>
					<p className="nile-step-label">
						<span>01</span>Define it on your backend
					</p>
					<CodePanel example={examples.action} />
				</div>
				<span
					className="nile-how-bridge"
					aria-hidden="true"
					data-reveal="scale"
				>
					<ArrowRight size={20} strokeWidth={1.75} />
				</span>
				<div className="nile-how-step" data-reveal>
					<p className="nile-step-label">
						<span>02</span>Call it from React
					</p>
					<CodePanel example={examples.react} />
				</div>
			</div>
			<p className="nile-center-link">
				<a
					className="nile-text-link"
					href={withBase("/guide/start/getting-started")}
				>
					Follow the complete setup <span aria-hidden="true">→</span>
				</a>
			</p>
		</section>
	);
}
