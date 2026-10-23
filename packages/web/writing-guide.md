# Nile documentation writing guide

Write for a small team building and maintaining a TypeScript backend. A reader should be able to find an operation, follow its behavior and make a safe change without someone explaining the framework first.

These conventions adapt Nylon Pay's general writing guide to a public backend framework. Nile's configuration, libraries and execution behavior are part of its developer contract, so name them when they help someone implement or diagnose an application.

## Start from the reader's task

- Explain the outcome before listing options: validating an order, sharing an access rule or finding a failed execution.
- Give each page one purpose. Keep setup, concepts and detailed reference distinguishable in navigation.
- Use direct language: "Return an Err when access is refused" instead of "This guide covers the error handling capabilities."
- Tie a convention to its practical value for the team. Show how the same pattern helps someone find the next action.
- Cut repeated introductions, hype, unsupported comparisons and statements about absent features unless the limitation affects an implementation decision.

## Check every claim against code

- Match exported names, parameters, defaults, Result shapes and transport behavior exactly.
- Keep examples explicit: name inferred input types and handler functions, use full block bodies and guard braces, and write object properties in full rather than using shorthand. Avoid clever expressions or omitted steps.
- Label snippets as a complete example or identify the surrounding application functions and configuration they require.
- Import public APIs from their published packages. Prefer `import { utils } from "@nilejs/nile"` for general-purpose helpers.
- Distinguish Slang Results, HTTP envelopes and frontend client responses. Show the correct success and failure checks for each.
- Explain shared versus execution-local state, cancellation behavior and process-local limits where a reader needs those facts.
- Publish implemented behavior. Keep proposals and migration working notes in the repository's ignored internal documentation.
- Keep benchmark values derived from recorded data. Include workload, methodology, machine and measurement limits; avoid universal performance promises.

## Make pages easy to navigate

- Every guide has short `title` and factual `description` frontmatter. The layout renders the page title; start the body with useful prose and `##` headings.
- Use sentence case and ordered heading levels. Never skip from `##` to `####`.
- Use language-tagged fences: `ts`, `sh`, `json`, `text`. Use realistic domain names and safe sample values.
- Use tables for comparable options and return fields, numbered lists for steps and bullets for parallel facts.
- Use extension-free absolute guide links such as `/guide/basics/actions`. Add a short "See also" section when it helps the next task.
- Keep prose calm and concise. Use ordinary punctuation, plain words and human units; preserve exact names and numeric units inside code and API reference.

## Review before publishing

Run `bun run docs:check`, `bun run types:check` and `bun run build`. The content check enforces frontmatter, heading order, code languages and local page links. The build pre-renders the website, search index, page Markdown and assistant exports from the same source.

Review changed examples against the implementation. Check navigation, search, code copying, the dark-only appearance, and desktop and phone layouts in a browser. Record internal decisions separately from the public guides.
