import { type KeyboardEvent, useRef, useState } from "react";
import { examples } from "../../home-code-blocks";
import { CodePanel } from "./code-panel";
import { PartHeader } from "./how-nile-works";

const INTENTS = [
	{
		key: "explore",
		label: "Explore",
		situation: "An agent asks what the projects service can do.",
		request: examples.exploreRequest,
		response: examples.exploreResponse,
	},
	{
		key: "schema",
		label: "Schema",
		situation:
			"A form or an agent checks exactly what projects.create accepts.",
		request: examples.schemaRequest,
		response: examples.schemaResponse,
	},
	{
		key: "execute",
		label: "Execute",
		situation: "The frontend creates a project.",
		request: examples.executeRequest,
		response: examples.executeResponse,
	},
] as const;

type IntentKey = (typeof INTENTS)[number]["key"];

/** Part 3: one endpoint, three intents, shown as real requests and responses in tabs. */
export function RestRpc() {
	const [active, setActive] = useState<IntentKey>("explore");
	const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

	/** Arrow keys move between tabs, following the WAI-ARIA tabs pattern. */
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const step =
			event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
		if (step === 0) {
			return;
		}
		event.preventDefault();
		const index = INTENTS.findIndex((intent) => intent.key === active);
		const next = INTENTS[(index + step + INTENTS.length) % INTENTS.length];
		setActive(next.key);
		tabs.current[next.key]?.focus();
	};

	return (
		<article className="nile-part" aria-labelledby="part-intents">
			<PartHeader number="03" id="part-intents" title="REST RPC Innovation">
				REST RPC borrows from both: plain HTTP and JSON from REST, named
				operations from RPC. One endpoint, <code>/api/services</code>, takes
				three intents, so there are no route trees to design or keep in sync.
			</PartHeader>
			<div className="nile-intents" data-reveal>
				<div
					className="nile-segmented nile-intent-tabs"
					role="tablist"
					aria-label="Intents"
					onKeyDown={onKeyDown}
				>
					{INTENTS.map((intent) => (
						<button
							key={intent.key}
							ref={(node) => {
								tabs.current[intent.key] = node;
							}}
							type="button"
							role="tab"
							id={`intent-tab-${intent.key}`}
							aria-selected={active === intent.key}
							aria-controls={`intent-panel-${intent.key}`}
							tabIndex={active === intent.key ? 0 : -1}
							onClick={() => setActive(intent.key)}
						>
							{intent.label}
						</button>
					))}
				</div>
				{INTENTS.map((intent) => (
					<div
						key={intent.key}
						role="tabpanel"
						id={`intent-panel-${intent.key}`}
						aria-labelledby={`intent-tab-${intent.key}`}
						hidden={active !== intent.key}
						className="nile-intent-panel"
					>
						<p className="nile-intent-situation">{intent.situation}</p>
						<div className="nile-part-code nile-part-code-even">
							<CodePanel example={intent.request} />
							<CodePanel example={intent.response} />
						</div>
					</div>
				))}
			</div>
		</article>
	);
}
