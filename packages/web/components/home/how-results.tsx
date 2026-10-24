import { examples } from "../../home-code-blocks";
import { CodePanel } from "./code-panel";
import { PartHeader } from "./how-nile-works";

/** Part 2: the Result pattern from first principles, on both sides of one call. */
export function ErrorsAsValues() {
	return (
		<article className="nile-part" aria-labelledby="part-results">
			<PartHeader
				number="02"
				id="part-results"
				title="Errors As Values, Make The Happy Path Obvious"
			>
				Every failure is a value the handler returns, never a surprise throw.
				The caller checks it first, then reads the result.
			</PartHeader>
			<div className="nile-part-code nile-part-code-even" data-reveal>
				<CodePanel example={examples.resultBackend} />
				<CodePanel example={examples.resultFrontend} />
			</div>
			<p className="nile-legend" data-reveal>
				<span className="is-err">Failure path</span>
				<span className="is-ok">Happy path</span>
			</p>
		</article>
	);
}
