import { ArrowUpRight } from "lucide-react";
import { examples } from "../../home-code-blocks";
import { CodePanel } from "./code-panel";

const SLANG_NPM = "https://www.npmjs.com/package/slang-ts";

/** slang-ts's main utilities; `inNile` marks the ones Nile's own pipeline is built on. */
const UTILITIES = [
	{
		name: "Result",
		api: "Ok · Err",
		text: "Success or failure as a value. Every Nile handler returns one.",
		inNile: true,
	},
	{
		name: "safeTry",
		api: "safeTry(fn)",
		text: "Runs code that can throw or reject and hands back one Result.",
		inNile: true,
	},
	{
		name: "Option",
		api: "option · Some · None",
		text: "A value that may be missing, without null checks everywhere.",
		inNile: false,
	},
	{
		name: "match",
		api: "match(value, cases)",
		text: "Handles every case of a Result or Option, checked by the compiler.",
		inNile: false,
	},
	{
		name: "pipe",
		api: "pipe(value, ...steps)",
		text: "Composes Result-returning steps that stop at the first Err.",
		inNile: false,
	},
	{
		name: "SuperPromise",
		api: "superPromise(task, options)",
		text: "Retry, time out or cancel a promise, then settle into Ok or Err.",
		inNile: false,
	},
];

/** Point readers from Nile's Results to the library behind them, for the rest of their code. */
export function FunctionalSlang() {
	return (
		<section
			className="nile-section nile-slang"
			id="slang-ts"
			aria-labelledby="slang-title"
		>
			<header className="nile-heading nile-heading-split" data-reveal>
				<div>
					<h2 id="slang-title">Go Full Functional Programming With slang-ts</h2>
				</div>
				<p>
					Nile Js is built on slang-ts, a small functional programming library
					from the creator of Nile Js. Your handlers already return its Results.
					Import all of it from <code>@nilejs/nile/fp</code>, with no extra
					dependency.
				</p>
			</header>
			<div className="nile-slang-grid">
				<ul className="nile-slang-utilities" data-reveal>
					{UTILITIES.map((utility) => (
						<li key={utility.name}>
							<p className="nile-slang-name">
								<strong>{utility.name}</strong>
								{utility.inNile ? <span>Used by Nile</span> : null}
							</p>
							<code>{utility.api}</code>
							<p>{utility.text}</p>
						</li>
					))}
				</ul>
				<div className="nile-slang-code" data-reveal>
					<CodePanel example={examples.slang} />
					<a className="nile-text-link" href={SLANG_NPM}>
						slang-ts on npm{" "}
						<ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
					</a>
				</div>
			</div>
		</section>
	);
}
