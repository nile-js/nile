import { type Framework, FrameworkProvider } from "fumadocs-core/framework";
import { RootProvider } from "fumadocs-ui/provider/base";
import { lazy, type ReactNode, useMemo } from "react";
import {
	Link,
	useLocation,
	useNavigate,
	useParams,
	useRevalidator,
} from "react-router";
import { withBase, withoutBase } from "../lib/site";

// Search and its index load after the page is interactive, not before first paint.
const SearchDialog = lazy(() => import("./search"));

const DOWNLOAD_PATH = /\.(?:txt|md|json|svg|png)(?:[?#]|$)/;

const framework: Framework = {
	usePathname() {
		return withBase(useLocation().pathname);
	},
	useParams() {
		return Object.fromEntries(
			Object.entries(useParams()).filter(
				(entry): entry is [string, string] => typeof entry[1] === "string",
			),
		);
	},
	useRouter() {
		const navigate = useNavigate();
		const revalidator = useRevalidator();
		return useMemo(
			() => ({
				push: (url: string) => navigate(withoutBase(url)),
				refresh: () => revalidator.revalidate(),
			}),
			[navigate, revalidator],
		);
	},
	Link({ href = "", prefetch, ...props }) {
		if (/^(?:https?:|mailto:|#)/.test(href) || DOWNLOAD_PATH.test(href)) {
			return (
				<a href={href.startsWith("/") ? withBase(href) : href} {...props} />
			);
		}
		return (
			<Link
				to={withoutBase(href)}
				prefetch={prefetch ? "intent" : "none"}
				{...props}
			/>
		);
	},
};

/** Keep source URLs and active navigation consistent under the published subpath. */
export function SiteProvider({ children }: { children: ReactNode }) {
	return (
		<FrameworkProvider {...framework}>
			<RootProvider
				search={{ SearchDialog }}
				theme={{
					forcedTheme: "dark",
					defaultTheme: "dark",
					enableSystem: false,
					themes: ["dark"],
					hotKey: false,
				}}
			>
				{children}
			</RootProvider>
		</FrameworkProvider>
	);
}
