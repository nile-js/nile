import { useState } from "react";
import benchmark from "../../../benchmarks/reference/rankings.json";
import { withBase } from "./links";

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
			<div className="nile-section-heading nile-wide-heading">
				<div>
					<p className="nile-eyebrow">Performance behind the workflow</p>
					<h2 id="performance-title">
						Measured with
						<br />a 300-action backend.
					</h2>
				</div>
				<p>
					The same authenticated shopping workflow across ten frameworks. These
					are observed results from our everyday PC, with every measured round
					retained.
				</p>
			</div>
			<div className="nile-benchmark">
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
								<th scope="row">{row.label}</th>
								<td>
									<div className="nile-bar-track" aria-hidden="true">
										<span
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
				<div className="nile-benchmark-method">
					<div>
						<span className="nile-small-label">How we tested</span>
						<p>
							Up to 32 shoppers browsed, filled carts and placed orders. Each
							sample warmed 500 journeys, then measured 5,000 six-request
							journeys. Every framework ran in each of six rounds. Responses and
							order counts were checked. Data stayed in memory, with no
							database.
						</p>
					</div>
					<div>
						<span className="nile-small-label">Machine and scope</span>
						<p>
							Intel Core i5-6300U · 4 logical CPUs · 15.5 GiB RAM. App and
							client shared the PC; other apps were running. Recorded October
							2026. Adapter choices and desktop variation affect these results.
						</p>
					</div>
				</div>
				<div className="nile-benchmark-links">
					<a href={withBase("/guide/reference/performance")}>
						Methodology, variation and adapter details ↗
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
