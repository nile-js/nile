import { withBase } from "./links";

/** Keep coding-agent navigation distinct from optional runtime discovery and authorization. */
export function Discovery() {
	return (
		<section
			className="nile-section nile-discovery"
			aria-labelledby="discovery-title"
		>
			<div>
				<p className="nile-eyebrow">
					Clear for people. Discoverable for tools.
				</p>
				<h2 id="discovery-title">
					Give the next teammate
					<br />a map of the work.
				</h2>
				<p className="nile-section-intro">
					Consistent domains and actions help people and coding agents find
					their way through the codebase.
				</p>
				<p>
					When you enable API discovery, integrations can also inspect available
					operations and their input schemas, then execute actions through the
					same API. Your application still controls access.
				</p>
				<div className="nile-inline-links">
					<a
						className="nile-text-link"
						href={withBase("/guide/basics/discovery-and-agents")}
					>
						Build an agent integration ↗
					</a>
					<a className="nile-text-link" href={withBase("/llms.txt")}>
						Documentation for coding agents ↗
					</a>
				</div>
			</div>
			<div className="nile-discovery-flow">
				<div>
					<span>01</span>
					<strong>Explore</strong>
					<p>Find services and the operations they expose.</p>
				</div>
				<div>
					<span>02</span>
					<strong>Inspect</strong>
					<p>Read the JSON Schema for an action's input.</p>
				</div>
				<div>
					<span>03</span>
					<strong>Execute</strong>
					<p>Call the action under your application's access rules.</p>
				</div>
				<p className="nile-discovery-note">
					Discovery is opt-in. Connect it to your tool runtime; Nile does not
					include an MCP server.
				</p>
			</div>
		</section>
	);
}
