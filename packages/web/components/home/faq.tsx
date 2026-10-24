import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { withBase } from "./links";

/** Short answers drawn from the documentation FAQ; the full page carries the details. */
const QUESTIONS: { question: string; answer: ReactNode }[] = [
	{
		question: "Who is Nile Js for?",
		answer:
			"Small teams building growing business applications: internal tools, dashboards, billing systems and product backends. A few conventions give each operation a recognizable home, so the next feature does not need a new structure.",
	},
	{
		question: "Does Nile enforce domain-driven design?",
		answer:
			"Yes, so the codebase still scales as it grows. Each business domain is a service under src/services, listed in services.config.ts, with one file per action. Nile checks that layout at startup: the CLI starter refuses to boot on a violation, and existing apps get warnings until they opt in.",
	},
	{
		question: "How are actions addressed?",
		answer: (
			<>
				Every call is a <code>POST</code> to <code>/api/services</code> whose
				body names the <code>intent</code>, <code>service</code>,{" "}
				<code>action</code> and <code>payload</code>. Custom routes remain
				available for webhooks and health checks.
			</>
		),
	},
	{
		question: "What happens when an action fails?",
		answer: (
			<>
				Return <code>Err(message)</code> for an expected failure. A handler that
				throws is caught and answered as a failed Result. Startup configuration
				errors can still throw, and transport errors can return HTTP 500.
			</>
		),
	},
	{
		question: "Does Nile handle access control?",
		answer:
			"Nile verifies JWTs for protected actions when server authentication is configured. Your application implements role, organization and resource policies in hooks or business logic.",
	},
	{
		question: "How does the frontend connect?",
		answer: (
			<>
				Use <code>@nilejs/client</code> to invoke named actions and read
				Results. The CLI can generate input types from your service registry, so
				names and payloads are checked when you pass them to the client.
			</>
		),
	},
	{
		question: "Can agents discover and execute operations?",
		answer:
			"When you enable discovery, the explore and schema intents expose operation metadata and input schemas. An agent integration still chooses permitted tools, supplies credentials and invokes actions. Discovery is off by default.",
	},
	{
		question: "Must I use Bun, Hono or Drizzle?",
		answer:
			"No. Choose Bun's native server, or the Hono adapter on Bun or Node.js. Bring your own database and data access; the Drizzle helpers are optional.",
	},
];

/** A two-column grid of native disclosure widgets, so answers open without JavaScript. */
export function Faq() {
	return (
		<section
			className="nile-section nile-faq"
			id="faq"
			aria-labelledby="faq-title"
		>
			<header className="nile-heading nile-heading-center" data-reveal>
				<h2 id="faq-title">Frequently Asked Questions</h2>
			</header>
			<div className="nile-faq-grid">
				{QUESTIONS.map((item) => (
					<details key={item.question} data-reveal>
						<summary>
							{item.question}
							<ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
						</summary>
						<p>{item.answer}</p>
					</details>
				))}
			</div>
			<p className="nile-center-link">
				<a className="nile-text-link" href={withBase("/guide/reference/faq")}>
					Read the full FAQ
				</a>
			</p>
		</section>
	);
}
