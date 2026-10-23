import { Link } from "react-router";

export const meta = () => [
	{ title: "Page not found | Nile Js" },
	{ name: "robots", content: "noindex" },
];

/** Offer a direct path back when a bookmarked guide is missing. */
export default function NotFound() {
	return (
		<main id="main-content" className="nile-not-found">
			<span className="nile-not-found-code">404</span>
			<h1>Find your next step.</h1>
			<p>
				This address does not match a Nile page. Start with the guide or head
				back to the homepage.
			</p>
			<div>
				<Link to="/guide/start/getting-started">Open documentation ↗</Link>
				<Link to="/">Back to Nile</Link>
			</div>
		</main>
	);
}
