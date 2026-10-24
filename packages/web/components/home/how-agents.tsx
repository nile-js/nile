import { absoluteUrl } from "../../app/lib/site";
import { examples } from "../../home-code-blocks";
import { CodePanel } from "./code-panel";
import { CopyButton } from "./copy-button";
import { PartHeader } from "./how-nile-works";

/** The agents guide's workflow, condensed into one prompt a person can paste into their assistant. */
const START_PROMPT = `You are working on a Nile Js backend (TypeScript-first, service and actions oriented).

Before you write code:
1. Read ${absoluteUrl("/llms.txt")}, and node_modules/@nilejs/nile/SKILL.md if the package is installed.
2. If there is no project yet, create one with: bunx @nilejs/cli new my-app
3. Read src/services/services.config.ts, then the action files of the service you will change.

When you add or change an action:
- Use a named Zod schema, an inferred input type, a named handler and createAction<T>.
- Return Ok(value) or Err(message) from @nilejs/nile/fp. Do not throw for expected failures.
- Register the action in its service's actions list.
- Run ./node_modules/.bin/tsc --noEmit and fix every error before you continue.

When a call fails validation, read data.issues, fetch the action's input with the "schema" intent, fix the payload and retry.
If a Nile Js API is not in the documentation or the installed package, say so instead of inventing it.
Stop after each step and tell me what you changed.

My first task: `;

const STEPS = [
	{
		title: "The agent calls an action",
		text: "It sends the payload it expects projects.create to accept.",
	},
	{
		title: "Nile names every problem",
		text: "A 400 answer lists each failing field in data.issues, with its path.",
	},
	{
		title: "The agent checks the contract",
		text: "The schema intent returns the action's JSON Schema. The agent fixes the payload and retries.",
	},
];

/** Part 5: a ready-made prompt, plus the failure an agent sees and how it corrects itself. */
export function AgentsReady() {
	return (
		<article className="nile-part" aria-labelledby="part-agents">
			<PartHeader number="05" id="part-agents" title="Agents Ready">
				Named actions, typed input and one registry give a coding agent the same
				map your team uses. When a call fails, Nile tells the agent exactly what
				to fix.
			</PartHeader>
			<div className="nile-part-split nile-part-split-even">
				<div className="nile-agent-copy" data-reveal>
					<div className="nile-prompt">
						<div className="nile-prompt-heading">
							<p>Start prompt</p>
							<CopyButton
								text={START_PROMPT}
								label="Copy start prompt"
								subject=""
								className="nile-button nile-prompt-copy"
							/>
						</div>
						<pre>{START_PROMPT}</pre>
					</div>
					<ol className="nile-agent-steps">
						{STEPS.map((step, index) => (
							<li key={step.title}>
								<span aria-hidden="true">{index + 1}</span>
								<div>
									<strong>{step.title}</strong>
									<p>{step.text}</p>
								</div>
							</li>
						))}
					</ol>
				</div>
				<div className="nile-part-stack" data-reveal>
					<CodePanel example={examples.agentRequest} />
					<CodePanel example={examples.agentResponse} />
				</div>
			</div>
		</article>
	);
}
