import { installRaw } from "../../home-code-blocks";
import { CopyButton } from "./copy-button";
import { withBase } from "./links";

/** Lead with the team's work over a full-width river that curves and fades into the page. */
export function Hero() {
	return (
		<section className="nile-hero" aria-labelledby="hero-title">
			<div className="nile-hero-art" aria-hidden="true">
				<picture>
					<source
						srcSet={withBase("/images/nile-river-hero.avif")}
						type="image/avif"
					/>
					<img
						className="nile-hero-river"
						src={withBase("/images/nile-river-hero.webp")}
						alt=""
						width={1024}
						height={1024}
						fetchPriority="high"
					/>
				</picture>
				<img
					className="nile-hero-veil"
					src={withBase("/images/nile-hero-veil.svg")}
					alt=""
				/>
			</div>
			<div className="nile-hero-inner">
				<div className="nile-hero-copy">
					<h1 id="hero-title">
						Keep shipping as your <span>backend grows.</span>
					</h1>
					<p className="nile-lead">
						Services and actions give every feature a familiar home, so your
						team keeps adding work without losing its way.
					</p>
					<div className="nile-actions">
						<a
							className="nile-button"
							href={withBase("/guide/start/getting-started")}
						>
							Build your first service <span aria-hidden="true">↗</span>
						</a>
						<a className="nile-text-link" href="#how-it-works">
							See how it works <span aria-hidden="true">↓</span>
						</a>
					</div>
					<div className="nile-install">
						<span className="nile-install-prompt" aria-hidden="true">
							$
						</span>
						<code>{installRaw}</code>
						<CopyButton text={installRaw} />
					</div>
				</div>
				<div className="nile-hero-mark" aria-hidden="true">
					<img
						className="nile-hero-ripples"
						src={withBase("/images/nile-ripples.svg")}
						alt=""
						width={640}
						height={640}
					/>
					<img
						className="nile-hero-logo"
						src={withBase("/nile-logo.svg")}
						alt=""
						width={360}
						height={360}
					/>
				</div>
			</div>
		</section>
	);
}
