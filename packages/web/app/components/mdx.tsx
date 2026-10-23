import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";

/** Apply the same accessible code, link and callout components to every guide. */
export function getMDXComponents(): MDXComponents {
	return { ...defaultComponents, Tab, Tabs };
}
