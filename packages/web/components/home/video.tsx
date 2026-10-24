import { Play } from "lucide-react";
import { useState } from "react";

const VIDEO_ID = "hbK5DzeL_ZA";
const VIDEO_TITLE =
	"Hussein Kizza and Ssali Jonathan on a fresh approach to backend APIs with Nile Js";
const THUMBNAIL = `https://i.ytimg.com/vi_webp/${VIDEO_ID}`;

/**
 * Show a lightweight poster and load YouTube's player only when the visitor
 * presses play. Playback always starts from the beginning.
 */
export function Video() {
	const [isPlaying, setIsPlaying] = useState(false);
	return (
		<section className="nile-section nile-video" aria-labelledby="video-title">
			<header className="nile-heading nile-heading-center" data-reveal>
				<h2 id="video-title">The Thinking Behind Nile Js.</h2>
				<p>
					Hussein Kizza and Ssali Jonathan on the Nile Js approach to backend
					APIs.{" "}
					<a
						className="nile-inline-link"
						href={`https://www.youtube.com/watch?v=${VIDEO_ID}&t=0s`}
					>
						Watch on YouTube ↗
					</a>
				</p>
			</header>
			<div className="nile-video-frame" data-reveal="scale">
				{isPlaying ? (
					<iframe
						src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?start=0&rel=0&autoplay=1`}
						title={`Video: ${VIDEO_TITLE}`}
						allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
						referrerPolicy="strict-origin-when-cross-origin"
						allowFullScreen
					/>
				) : (
					<button
						type="button"
						className="nile-video-poster"
						onClick={() => setIsPlaying(true)}
						aria-label={`Play video: ${VIDEO_TITLE}`}
					>
						<img
							src={`${THUMBNAIL}/maxresdefault.webp`}
							srcSet={`${THUMBNAIL}/sddefault.webp 640w, ${THUMBNAIL}/maxresdefault.webp 1280w`}
							sizes="(max-width: 760px) 100vw, 1160px"
							alt=""
							width={1280}
							height={720}
							loading="lazy"
							decoding="async"
						/>
						<span className="nile-video-play" aria-hidden="true">
							<Play size={28} strokeWidth={2} fill="currentColor" />
						</span>
					</button>
				)}
			</div>
		</section>
	);
}
