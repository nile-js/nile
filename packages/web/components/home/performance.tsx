import { useState } from "react";
import benchmark from "../../../benchmarks/reference/rankings.json";
import { withBase } from "./links";

const METHOD = [
	{
		term: "Workload",
		detail:
			"Up to 32 shoppers · 5,000 six-request journeys a sample · 6 rounds",
	},
	{
		term: "Checks",
		detail: "Responses and order counts verified · in-memory data, no database",
	},
	{
		term: "Machine",
		detail: "Intel Core i5-6300U · 4 logical CPUs · 15.5 GiB · October 2026",
	},
] as const;

/** Display recorded means directly from the audited rankings; never synthesize throughput. */
export function Performance() {
	const [mode, setMode] = useState<"validated" | "plain">("validated");
	const rows = benchmark.rankings[mode];
	const maximum = rows[0].meanRequestsPerSecond;
	return (
		<section
			className="nile-section nile-performance"
			id="performance"
			aria-labelledby="performance-title"
		>
			<header className="nile-heading nile-heading-split" data-reveal>
				<div>
					<h2 id="performance-title">
						Measured with
						<br />a 300-action backend.
					</h2>
				</div>
				<p>
					We measured the same authenticated shopping workflow in ten frameworks
					on an everyday PC, to see how Nile Js holds up under realistic load.
					Your numbers will depend on your application and hardware.
				</p>
			</header>
			<div className="nile-benchmark" data-reveal>
				<div className="nile-benchmark-heading">
					<div>
						<strong>Ecommerce API</strong>
						<span>Average requests per second · higher is better</span>
					</div>
					<fieldset className="nile-segmented" aria-label="Payload validation">
						<button
							type="button"
							aria-pressed={mode === "validated"}
							onClick={() => setMode("validated")}
						>
							Zod validation on
						</button>
						<button
							type="button"
							aria-pressed={mode === "plain"}
							onClick={() => setMode("plain")}
						>
							Off
						</button>
					</fieldset>
				</div>
				<table className="nile-benchmark-table">
					<caption className="nile-sr-only">
						Six-round throughput averages with payload validation{" "}
						{mode === "validated" ? "enabled" : "disabled"}. JWT and CORS
						enabled in both modes.
					</caption>
					<thead>
						<tr>
							<th scope="col">Framework</th>
							<th scope="col">
								<span className="nile-sr-only">Relative throughput</span>
							</th>
							<th scope="col">Req/s</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr
								key={row.framework}
								className={
									row.framework === "nile-native"
										? "nile-benchmark-highlight"
										: ""
								}
							>
								<th scope="row">
									{row.framework === "nile-native" ? "Nile Js" : row.label}
								</th>
								<td>
									<div className="nile-bar-track" aria-hidden="true">
										<span
											className="nile-bar-fill"
											style={{
												width: `${(row.meanRequestsPerSecond / maximum) * 100}%`,
											}}
										/>
									</div>
									<span className="nile-sr-only">
										Range {Math.round(row.minRequestsPerSecond)} to{" "}
										{Math.round(row.maxRequestsPerSecond)} requests per second.
									</span>
								</td>
								<td>
									{Math.round(row.meanRequestsPerSecond).toLocaleString(
										"en-US",
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<dl className="nile-benchmark-method">
					{METHOD.map((item) => (
						<div key={item.term}>
							<dt>{item.term}</dt>
							<dd>{item.detail}</dd>
						</div>
					))}
				</dl>
				<p className="nile-benchmark-note">
					App and client shared a desktop with other apps running. Adapter
					choice and machine variation affect these results.
				</p>
				<div className="nile-benchmark-links">
					<a href={withBase("/guide/reference/performance")}>
						Methodology and variation ↗
					</a>
					<a href={withBase("/benchmarks/results.json")}>Raw measurements ↗</a>
					<a href="https://github.com/nile-js/nile/tree/main/packages/benchmarks">
						Reproduce this workload ↗
					</a>
				</div>
			</div>
		</section>
	);
}
