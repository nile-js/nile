import { useState } from "react";
import { examples } from "../../home-code-blocks";
import { CodePanel } from "./code-panel";
import { withBase } from "./links";

const STEPS = [
	{
		key: "action",
		title: "Define the work",
		note: "Keep input checks and the handler together.",
	},
	{
		key: "service",
		title: "Give it a home",
		note: "Group the operation with its business domain.",
	},
	{
		key: "server",
		title: "Connect the application",
		note: "Register your services and start the listener.",
	},
	{
		key: "client",
		title: "Call the operation",
		note: "Use the same service and action names from your frontend.",
	},
] as const;

/** Use standard pressed buttons for a keyboard-accessible example selector without tab-key overrides. */
export function Workflow() {
	const [selected, setSelected] =
		useState<(typeof STEPS)[number]["key"]>("action");
	return (
		<section
			className="nile-section"
			id="example"
			aria-labelledby="workflow-title"
		>
			<div className="nile-section-heading nile-wide-heading">
				<div>
					<p className="nile-eyebrow">From a business need to a working API</p>
					<h2 id="workflow-title">
						One operation.
						<br />A pattern you can repeat.
					</h2>
				</div>
				<p>
					The next feature follows the same path. Your team learns the shape
					once, then spends its attention on what the product needs.
				</p>
			</div>
			<div className="nile-workflow">
				<fieldset className="nile-workflow-steps" aria-label="Example files">
					{STEPS.map((step, index) => (
						<button
							key={step.key}
							type="button"
							aria-pressed={selected === step.key}
							aria-controls="workflow-code"
							onClick={() => setSelected(step.key)}
						>
							<span className="nile-step-number">0{index + 1}</span>
							<span>
								<strong>{step.title}</strong>
								<span>{step.note}</span>
							</span>
							<span aria-hidden="true">↗</span>
						</button>
					))}
				</fieldset>
				<div id="workflow-code">
					<CodePanel key={selected} example={examples[selected]} />
				</div>
			</div>
			<p className="nile-section-footnote">
				The example returns a project without storing it. Add your model or
				repository when persistence is needed.{" "}
				<a href={withBase("/guide/start/getting-started")}>
					Run the complete example →
				</a>
			</p>
		</section>
	);
}
