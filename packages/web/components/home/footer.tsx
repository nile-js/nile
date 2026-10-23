import { withBase } from "./links";

/** Keep a short route back to the source, documentation and license. */
export function Footer() {
	return (
		<footer className="nile-footer" data-reveal>
			<a className="nile-wordmark" href={withBase("/")}>
				<img src={withBase("/nile-logo.svg")} width={30} height={30} alt="" />
				Nile Js
			</a>
			<nav aria-label="Footer">
				<a href="https://github.com/nile-js/nile">GitHub</a>
				<a href={withBase("/guide/start/getting-started")}>Documentation</a>
				<a href="https://github.com/nile-js/nile/blob/main/LICENSE">
					MIT license
				</a>
			</nav>
		</footer>
	);
}
