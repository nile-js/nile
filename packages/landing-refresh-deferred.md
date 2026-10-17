# Deferred Nile landing-page refresh

Date: October 17, 2026. Status: deferred by the owner; benchmarking is the current priority.

## Owner's direction

Nile aims to become a leading TypeScript framework for speed while offering a simpler application architecture than traditional frameworks. Refresh the existing landing page after reproducible benchmarking establishes defensible performance claims. This brief authorizes no landing implementation.

## Current source and positioning

The current homepage is `web/docs/index.tsx`, styled by `web/docs/home.css`, with examples in `web/home-code-blocks`. It introduces a TypeScript service-action backend, grouped domain operations, validation, Result-based errors and discovery for application and agent consumers. It includes installation, action/service/server/client examples and feature sections.

Keep the service-action model concrete: an action implements one operation, a service groups related actions, and the transport supports execution and discovery. Show actual supported code and an ordinary application use case before discussing performance results.

The current `web/docs/guide/reference/framework-comparison.md` contains older categorical framework, runtime, performance and architecture claims and an outdated test count. Review each against the final measured configurations and current primary documentation during the refresh. Existing claims are not benchmark evidence. No web files are changed by this documentation task.

## Evidence gates for the refresh

- Link internal speed claims to [Nile before and after](nile-old-vs-new.md), with runtime, workload and in-process limitations visible. Do not present the safe pre-optimization local artifact as a published release.
- Use cross-framework charts only after the [benchmark plan](benchmarking-plan.md) has produced reviewed results, raw trials and reproducible fixtures. Label runtime, adapter, validation mode, operation count and error rate beside each comparison.
- Treat “fastest TypeScript framework” as an ambition until the defined, measured comparison supports a narrower factual claim. A result in one tested workload cannot establish fastest across all JavaScript applications.
- Support architecture claims with a reproducible feature implementation and change exercise: adding an operation, changing a validated input, applying authorization and composing behavior across domains. Record required files, setup, type feedback and maintenance trade-offs alongside speed.
- Describe lazy schema discovery, cache opt-outs, request isolation and startup statistics using the actual public APIs. Avoid claims of implemented transports, persistence integrations or automatic application caching without source verification.

## Proposed deliverables after benchmarking

1. A reviewed message outline anchored in the service-action workflow and realistic application examples.
2. A performance section with qualified comparisons, trial ranges, source links and an explanation of how to reproduce results.
3. An architecture walkthrough comparing equivalent features, including costs and limitations.
4. Updated installation and quick-start examples verified against the version being promoted.
5. A visual refresh of the existing page and responsive checks, preserving the documentation navigation and package links.

Follow `COPYWRITING.md`: clear technical language, factual claims, no hype, no emojis and no em dashes. Select the applicable design skill when implementation is actually requested. Read and back up existing web source before changes, then follow `web/AGENTS.md` and the project workflow.

## Completion boundary

For now, only this brief is delivered. No design, page code, deployment or publication is included. Benchmark evidence and the owner's follow-up direction determine the next landing-page task.
