// biome-ignore-all lint/security/noDangerouslySetInnerHtml: Only checked-in examples enter the build-time Shiki highlighter.
import { CopyButton } from "./copy-button";
import type { CodeExample } from "./types";

/** Render only build-generated Shiki markup, never visitor-provided HTML. */
export function CodePanel({ example }: { example: CodeExample }) {
	return (
		<div className="nile-code-panel" data-tone={example.tone}>
			<div className="nile-code-heading">
				<span title={example.file}>{example.file}</span>
				{example.side ? (
					<small className="nile-code-side" data-side={example.side}>
						{example.side}
					</small>
				) : null}
				<CopyButton text={example.raw} />
			</div>
			<div
				className="nile-highlight"
				dangerouslySetInnerHTML={{ __html: example.html }}
			/>
		</div>
	);
}
