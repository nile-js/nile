import "./home.css";
import { Head } from "@rspress/core/runtime";
import { Closing } from "../components/home/closing";
import { Discovery } from "../components/home/discovery";
import { Hero } from "../components/home/hero";
import { Performance } from "../components/home/performance";
import { ProductionStory } from "../components/home/production-story";
import { Structure } from "../components/home/structure";
import { TeamOutcomes } from "../components/home/team-outcomes";
import { Workflow } from "../components/home/workflow";

export const frontmatter = {
	pageType: "custom",
	title: "Nile — Keep shipping as your backend grows",
	description:
		"A functional TypeScript backend for small teams. Organize business operations into services and actions, onboard with familiar patterns, and keep building as your product grows.",
};

/** Compose the page around a team's work, supported by real examples and measured evidence. */
export default function Home() {
	return (
		<main className="nile-home" id="main-content">
			<Head>
				<title>Nile — Keep shipping as your backend grows</title>
				<meta
					property="og:title"
					content="Nile — Keep shipping as your backend grows"
				/>
				<meta
					property="og:image"
					content="https://nile-js.github.io/nile/og-nile.png"
				/>
				<meta property="og:image:width" content="1200" />
				<meta property="og:image:height" content="630" />
				<meta name="twitter:card" content="summary_large_image" />
			</Head>
			<Hero />
			<ProductionStory />
			<Structure />
			<Workflow />
			<TeamOutcomes />
			<Performance />
			<Discovery />
			<Closing />
		</main>
	);
}
