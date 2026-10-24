import type { ReactNode } from "react";
import { AgentsReady } from "./how-agents";
import { ServicesArchitecture } from "./how-architecture";
import { DomainDriven } from "./how-domains";
import { BuiltOnGiants } from "./how-giants";
import { RestRpc } from "./how-intents";
import { ErrorsAsValues } from "./how-results";

/** Number, title and an optional one-sentence promise shared by every part of the walkthrough. */
export function PartHeader({
	number,
	id,
	title,
	children,
}: {
	number: string;
	id: string;
	title: string;
	children?: ReactNode;
}) {
	return (
		<header className="nile-part-header" data-reveal>
			<p className="nile-step-label" aria-hidden="true">
				<span>{number}</span>
			</p>
			<h3 id={id}>{title}</h3>
			{children ? <p>{children}</p> : null}
		</header>
	);
}

/** Walk through the six ideas behind a Nile Js backend, each with something concrete to read. */
export function HowNileWorks() {
	return (
		<section
			className="nile-section nile-journey"
			id="how-nile-works"
			aria-labelledby="journey-title"
		>
			<header className="nile-heading nile-heading-center" data-reveal>
				<h2 id="journey-title">How It Works</h2>
			</header>
			<div className="nile-journey-parts">
				<ServicesArchitecture />
				<ErrorsAsValues />
				<RestRpc />
				<DomainDriven />
				<AgentsReady />
				<BuiltOnGiants />
			</div>
		</section>
	);
}
