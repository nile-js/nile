import { ArrowDown, MonitorSmartphone, Terminal } from "lucide-react";
import { FEATURES } from "./feature-catalog";
import { PartHeader } from "./how-nile-works";

const SERVICES = [
	{ name: "projects", actions: ["create", "list", "archive"] },
	{ name: "billing", actions: ["charge", "refund"] },
	{ name: "members", actions: ["invite", "remove"] },
];

const CALLED = { service: "projects", action: "create" };

/** Short labels for the catalog's features, keyed so icons and guides stay in one place. */
const CLOUD_LABELS: Record<string, string> = {
	results: "Zod validation",
	policies: "JWT and hooks",
	context: "Context and logs",
	controls: "Queues and throttling",
	telemetry: "OpenTelemetry",
	sockets: "WebSockets",
	schedules: "Cron jobs",
	models: "Database models",
	contracts: "API discovery",
	interfaces: "Direct calls",
	helpers: "Retries",
	quotas: "Rate limiting",
	files: "File uploads",
	lifecycle: "Graceful shutdown",
};

const CLOUD_EXTRAS = [
	{ key: "client", icon: MonitorSmartphone, label: "Typed client" },
	{ key: "cli", icon: Terminal, label: "CLI generators" },
];

/** Part 1: actions live inside services, and one call names both; beside it, the problems Nile already solves. */
export function ServicesArchitecture() {
	return (
		<article className="nile-part" aria-labelledby="part-architecture">
			<PartHeader
				number="01"
				id="part-architecture"
				title="Services And Actions Architecture"
			>
				A service groups related actions. Every call names one service and one
				action.
			</PartHeader>
			<div className="nile-part-split">
				<figure
					className="nile-diagram nile-arch"
					aria-label="A call names the projects service and its create action. Services hold actions; the called action validates input, runs its handler and returns Ok or Err."
					data-reveal
				>
					<div className="nile-arch-call">
						<small>One call</small>
						<code>
							{"{ "}
							<span className="is-service">service: "{CALLED.service}"</span>
							{", "}
							<span className="is-action">action: "{CALLED.action}"</span>
							{" }"}
						</code>
					</div>
					<ArrowDown className="nile-arch-arrow" size={18} aria-hidden="true" />
					<div className="nile-arch-services">
						{SERVICES.map((service) => (
							<div
								className="nile-arch-service"
								key={service.name}
								data-active={service.name === CALLED.service || undefined}
							>
								<p>
									<small>Service</small>
									<strong>{service.name}</strong>
								</p>
								<ul>
									{service.actions.map((action) => (
										<li
											key={action}
											data-active={
												(service.name === CALLED.service &&
													action === CALLED.action) ||
												undefined
											}
										>
											<small>Action</small>
											<code>{action}</code>
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
					<ArrowDown className="nile-arch-arrow" size={18} aria-hidden="true" />
					<ol className="nile-arch-run">
						<li>Validate input</li>
						<li>Run handler</li>
						<li className="nile-arch-outcome">
							<span className="is-ok">Ok</span>
							<span className="is-err">Err</span>
						</li>
					</ol>
				</figure>
				<aside className="nile-cloud" aria-labelledby="cloud-title" data-reveal>
					<h4 id="cloud-title">The Hard Parts, Solved Out Of The Box</h4>
					<p>
						Each one is a configuration option or a helper, not a library to
						wire in.
					</p>
					<ul>
						{FEATURES.map((feature) => {
							const Icon = feature.icon;
							return (
								<li key={feature.key} data-tone={feature.tone}>
									<Icon size={15} strokeWidth={1.75} aria-hidden="true" />
									{CLOUD_LABELS[feature.key] ?? feature.title}
								</li>
							);
						})}
						{CLOUD_EXTRAS.map((extra) => {
							const Icon = extra.icon;
							return (
								<li key={extra.key}>
									<Icon size={15} strokeWidth={1.75} aria-hidden="true" />
									{extra.label}
								</li>
							);
						})}
					</ul>
					<a className="nile-text-link" href="#features">
						See every built-in feature <span aria-hidden="true">↓</span>
					</a>
				</aside>
			</div>
		</article>
	);
}
