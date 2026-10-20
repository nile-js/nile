import { withBase } from "./links";

/** End on the next useful operation rather than another feature inventory. */
export function Closing() {
	return (
		<>
			<section className="nile-section nile-closing">
				<p className="nile-eyebrow">Start with the work in front of you</p>
				<h2>
					Your next feature
					<br />
					already has a place.
				</h2>
				<p>Build the first service. Keep the next one familiar.</p>
				<div className="nile-actions">
					<a
						className="nile-button"
						href={withBase("/guide/start/getting-started")}
					>
						Build with Nile <span aria-hidden="true">↗</span>
					</a>
					<a
						className="nile-text-link"
						href={withBase("/guide/start/runtime-adapters")}
					>
						Bun native and Hono compatibility ↗
					</a>
				</div>
			</section>
			<footer className="nile-footer">
				<a className="nile-wordmark" href={withBase("/")}>
					Nile<span className="nile-wordmark-dot">.</span>
				</a>
				<p>A functional TypeScript backend for small teams.</p>
				<nav aria-label="Footer">
					<a href="https://github.com/nile-js/nile">GitHub</a>
					<a href={withBase("/guide/start/getting-started")}>Documentation</a>
					<a href="https://github.com/nile-js/nile/blob/main/LICENSE">
						MIT license
					</a>
				</nav>
			</footer>
		</>
	);
}
