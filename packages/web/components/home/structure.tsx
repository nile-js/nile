import { FileCode, Folder } from "lucide-react";
import { useState } from "react";
import { examples } from "../../home-code-blocks";
import { CodePanel } from "./code-panel";
import { withBase } from "./links";

type ExampleKey = "action" | "service" | "server";

interface TreeRow {
	name: string;
	depth: number;
	isFolder: boolean;
	example?: ExampleKey;
	step?: string;
}

const TREE: readonly TreeRow[] = [
	{ name: "src", depth: 0, isFolder: true },
	{ name: "services", depth: 1, isFolder: true },
	{ name: "projects", depth: 2, isFolder: true },
	{ name: "actions", depth: 3, isFolder: true },
	{
		name: "create-project.ts",
		depth: 4,
		isFolder: false,
		example: "action",
		step: "01 The operation",
	},
	{ name: "archive-project.ts", depth: 4, isFolder: false },
	{ name: "modules", depth: 3, isFolder: true },
	{
		name: "index.ts",
		depth: 3,
		isFolder: false,
		example: "service",
		step: "02 The service",
	},
	{ name: "services.config.ts", depth: 2, isFolder: false },
	{
		name: "server.ts",
		depth: 1,
		isFolder: false,
		example: "server",
		step: "03 The server",
	},
];

/** Explore the recommended layout: selecting a file shows the code that lives there. */
export function Structure() {
	const [selected, setSelected] = useState<ExampleKey>("action");
	return (
		<section
			className="nile-section nile-structure"
			id="structure"
			aria-labelledby="structure-title"
		>
			<header className="nile-heading nile-heading-split" data-reveal>
				<div>
					<h2 id="structure-title">
						Open The Domain.
						<br />
						Find The Action. <span>Get To Work.</span>
					</h2>
				</div>
				<p>
					Every operation has a well known place, so a new teammate knows where
					to start.{" "}
					<a
						className="nile-inline-link"
						href={withBase("/guide/start/application-structure")}
					>
						Application structure ↗
					</a>
				</p>
			</header>
			<div className="nile-explorer">
				<fieldset
					className="nile-tree"
					aria-label="Project files"
					data-reveal="left"
				>
					<ul>
						{TREE.map((row) => {
							const Icon = row.isFolder ? Folder : FileCode;
							const indent = { paddingLeft: `${14 + row.depth * 18}px` };
							if (row.example === undefined) {
								return (
									<li key={row.name}>
										<span className="nile-tree-row" style={indent}>
											<Icon size={15} strokeWidth={1.75} aria-hidden="true" />
											{row.isFolder ? `${row.name}/` : row.name}
										</span>
									</li>
								);
							}
							const example = row.example;
							return (
								<li key={row.name}>
									<button
										type="button"
										className="nile-tree-row"
										style={indent}
										aria-pressed={selected === example}
										aria-controls="structure-code"
										onClick={() => setSelected(example)}
									>
										<Icon size={15} strokeWidth={1.75} aria-hidden="true" />
										{row.name}
										<span className="nile-tree-step">{row.step}</span>
									</button>
								</li>
							);
						})}
					</ul>
				</fieldset>
				<div
					id="structure-code"
					className="nile-explorer-code"
					data-reveal="right"
				>
					<CodePanel key={selected} example={examples[selected]} />
				</div>
			</div>
		</section>
	);
}
