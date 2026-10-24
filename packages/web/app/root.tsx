import sourceSansLatin from "@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2?url";
import type { ReactNode } from "react";
import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";
import type { Route } from "./+types/root";
import { SiteProvider } from "./components/provider";
import { SITE_DESCRIPTION, withBase } from "./lib/site";
import NotFound from "./routes/not-found";
import "@fontsource-variable/source-sans-3";
import "@fontsource/fira-mono";
import "./app.css";

export const links: Route.LinksFunction = () => [
	// The variable Latin file carries every weight, so text renders without a swap after layout.
	{
		rel: "preload",
		href: sourceSansLatin,
		as: "font",
		type: "font/woff2",
		crossOrigin: "anonymous",
	},
	{ rel: "icon", type: "image/svg+xml", href: withBase("/nile-logo.svg") },
	{
		rel: "icon",
		type: "image/png",
		sizes: "512x512",
		href: withBase("/nile-logo.png"),
	},
	{ rel: "apple-touch-icon", href: withBase("/nile-logo.png") },
];

/** Render a complete document for pre-rendering and subsequent client navigation. */
export function Layout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className="dark" suppressHydrationWarning>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<meta name="theme-color" content="#0c1118" />
				<meta name="color-scheme" content="dark" />
				<meta property="og:site_name" content="Nile Js" />
				<meta property="og:locale" content="en_US" />
				<meta name="twitter:card" content="summary_large_image" />
				<Meta />
				<Links />
			</head>
			<body suppressHydrationWarning>
				<a className="nile-skip-link" href="#main-content">
					Skip to content
				</a>
				<SiteProvider>{children}</SiteProvider>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export const meta: Route.MetaFunction = () => [
	{
		title:
			"Nile Js | TypeScript-first, service and actions oriented backend framework",
	},
	{ name: "description", content: SITE_DESCRIPTION },
];

export default function App() {
	return <Outlet />;
}

/** Keep missing routes useful and avoid exposing internal errors to site visitors. */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
	return (
		<main id="main-content" className="nile-not-found">
			<h1>Could not open this page</h1>
			<p>Try again, or return to the documentation.</p>
			<a href={withBase("/guide/start/getting-started")}>Open documentation</a>
		</main>
	);
}
