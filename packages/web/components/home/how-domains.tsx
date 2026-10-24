import { ChevronRight, File, Folder } from "lucide-react";
import type { CSSProperties } from "react";
import { PartHeader } from "./how-nile-works";
import { withBase } from "./links";

type Layer =
	| "root"
	| "services"
	| "actions"
	| "modules"
	| "business"
	| "models"
	| "hooks";

/** The application structure guide's layout; each entry takes its layer's color. */
const TREE: {
	depth: number;
	kind: "folder" | "file";
	name: string;
	layer: Layer;
}[] = [
	{ depth: 0, kind: "folder", name: "src", layer: "root" },
	{ depth: 1, kind: "file", name: "index.ts", layer: "root" },
	{ depth: 1, kind: "folder", name: "services", layer: "services" },
	{ depth: 2, kind: "file", name: "services.config.ts", layer: "services" },
	{ depth: 2, kind: "folder", name: "projects", layer: "services" },
	{ depth: 3, kind: "folder", name: "actions", layer: "actions" },
	{ depth: 4, kind: "file", name: "create-project.ts", layer: "actions" },
	{ depth: 4, kind: "file", name: "archive-project.ts", layer: "actions" },
	{ depth: 3, kind: "folder", name: "modules", layer: "modules" },
	{ depth: 1, kind: "folder", name: "business", layer: "business" },
	{ depth: 1, kind: "folder", name: "db/models", layer: "models" },
	{ depth: 1, kind: "folder", name: "hooks", layer: "hooks" },
];

const LEGEND: { layer: Layer; name: string; job: string }[] = [
	{
		layer: "services",
		name: "Services",
		job: "One folder per business domain",
	},
	{ layer: "actions", name: "Actions", job: "One file per operation" },
	{
		layer: "modules",
		name: "Modules",
		job: "Helpers the domain keeps private",
	},
	{
		layer: "business",
		name: "Business",
		job: "Plain functions for domain rules",
	},
	{ layer: "models", name: "Models", job: "Data access that returns Results" },
	{ layer: "hooks", name: "Hooks", job: "Policies around every action" },
];

const FLOW: { name: string; layer: Layer }[] = [
	{ name: "Request", layer: "root" },
	{ name: "Hooks", layer: "hooks" },
	{ name: "Action", layer: "actions" },
	{ name: "Business", layer: "business" },
	{ name: "Model", layer: "models" },
	{ name: "Result", layer: "root" },
];

/** Part 4: a colored folder map on the left, what each color means on the right, and how a call moves through them. */
export function DomainDriven() {
	return (
		<article className="nile-part" aria-labelledby="part-domains">
			<PartHeader number="04" id="part-domains" title="Domain Driven">
				Open the domain, find the action, follow it to the model. Nile checks
				this layout at startup.
			</PartHeader>
			<div className="nile-domain" data-reveal>
				<ul
					className="nile-diagram nile-domain-tree"
					aria-label="Project folders"
				>
					{TREE.map((entry) => {
						const Icon = entry.kind === "folder" ? Folder : File;
						return (
							<li
								key={`${entry.depth}-${entry.name}`}
								data-layer={entry.layer}
								style={{ "--depth": entry.depth } as CSSProperties}
							>
								<Icon size={16} strokeWidth={1.75} aria-hidden="true" />
								<code>{entry.name}</code>
							</li>
						);
					})}
				</ul>
				<div className="nile-domain-legend">
					<dl>
						{LEGEND.map((item) => (
							<div key={item.layer} data-layer={item.layer}>
								<dt>{item.name}</dt>
								<dd>{item.job}</dd>
							</div>
						))}
					</dl>
					<p>
						The full layout is in the{" "}
						<a
							className="nile-inline-link"
							href={withBase("/guide/start/application-structure")}
						>
							application structure guide
						</a>
						.
					</p>
				</div>
			</div>
			<ol
				className="nile-domain-flow"
				aria-label="How a call moves through the layers"
				data-reveal
			>
				{FLOW.map((stage, index) => (
					<li key={stage.name} data-layer={stage.layer}>
						{index > 0 ? (
							<ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
						) : null}
						<span>{stage.name}</span>
					</li>
				))}
			</ol>
		</article>
	);
}
