import { Layout as OriginalLayout } from "@rspress/core/theme-original";
import "./index.css";

export * from "@rspress/core/theme-original";

/** Preserve Rspress navigation, search and documentation layout. */
export function Layout() {
	return <OriginalLayout />;
}
