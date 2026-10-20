import { withBase } from "./links";

/** Show a recommended structure as a way to find work, not a required folder scanner. */
export function Structure() {
	return (
		<section
			className="nile-section nile-structure"
			id="structure"
			aria-labelledby="structure-title"
		>
			<div>
				<p className="nile-eyebrow">A familiar place for the next feature</p>
				<h2 id="structure-title">
					Open the domain.
					<br />
					Find the action.
					<br />
					<span>Get to work.</span>
				</h2>
				<p className="nile-section-intro">
					A new teammate should have somewhere clear to start. Group related
					operations into services, keep their business rules in ordinary
					functions, and give data access its own layer.
				</p>
				<p>
					Nile connects the operations you register. Your application keeps its
					own modules, libraries and data choices.
				</p>
				<a
					className="nile-text-link"
					href={withBase("/guide/start/application-structure")}
				>
					Follow the application structure <span aria-hidden="true">↗</span>
				</a>
			</div>
			<div className="nile-domain-map">
				<div className="nile-map-heading">
					<span>src / services / projects</span>
					<span className="nile-small-label">Recommended structure</span>
				</div>
				<ul className="nile-file-tree">
					<li>
						<span className="nile-tree-folder">projects/</span>
						<ul>
							<li className="nile-tree-selected">
								<code>create-project.ts</code>
								<span>The operation</span>
							</li>
							<li>
								<code>archive-project.ts</code>
								<span>The next operation</span>
							</li>
							<li>
								<code>types.ts</code>
								<span>Shared contracts</span>
							</li>
							<li>
								<code>index.ts</code>
								<span>The service</span>
							</li>
						</ul>
					</li>
					<li>
						<span className="nile-tree-folder">models/</span>
						<ul>
							<li>
								<code>projects.ts</code>
								<span>Your data access</span>
							</li>
						</ul>
					</li>
					<li>
						<code>services.config.ts</code>
						<span>Registered services</span>
					</li>
				</ul>
				<div className="nile-map-footnote">
					<span aria-hidden="true">↳</span>
					<p>
						One recognizable path from a business need to the code implementing
						it.
					</p>
				</div>
			</div>
		</section>
	);
}
