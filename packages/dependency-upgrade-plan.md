# Nile dependency upgrade

## User intent

Install Zod 4.6.7, upgrade the other dependencies reviewed in this chat, and run Nile's test suites.

## Scope and sequence

1. Back up the core manifest, root Bun lockfile, and existing logger test output, with an intent note.
2. Install the existing core and client dependency sets using Bun and record their baseline tests.
3. Pin Zod to exactly 4.6.7; update the other reviewed runtime and peer versions, including duplicate Drizzle development declarations.
4. Refresh the workspace lockfile and confirm the resolved core versions.
5. Run the core and client test suites, investigate failures, and record the outcome here.

Unrelated development tools and other workspace manifests are outside the upgrade scope. Do not start servers, publish packages, or run application database commands.

## Backup

`/home/kizz/CODE/new-nile/backup/dependency-upgrade-2026-10-16/` contains the original files and `intent.md`.

## Results

- Baseline: 338 core tests across 17 files and 26 client tests across 3 files passed.
- Installed the reviewed runtime upgrades, exact Zod 4.6.7, Drizzle ORM 0.45.4, and TypeScript 7.0.2. Drizzle Zod remains at its already-current 0.8.3.
- Added TypeScript as an explicit core development dependency because the existing peer declaration alone resolved to workspace TypeScript 5.9.3.
- After upgrades: all 338 core tests passed with TypeScript 7 installed, and all 26 client tests passed.
- JavaScript ESM and CommonJS builds succeeded, but tsup's declaration generator failed because TypeScript 7 no longer exposes the legacy compiler API.
- A direct TypeScript 7 check also identified the removed `baseUrl` compiler option in the core configuration.
- Restored the existing logger fixture after tests. Full test and build output is preserved in the backup directory.

## TypeScript 7 build follow-up

The user asked to keep TypeScript 7 and fix the build instead of retaining TypeScript 5.9.3.

The user approved tsdown for Nile core. Implemented approach:

1. Replace core tsup with tsdown, whose declaration plugin supports the native TypeScript 7 generator.
2. Preserve the core package's existing ESM/CommonJS entry files, source maps, and bundled declaration outputs.
3. Remove the obsolete core `baseUrl` setting while preserving the existing relative path mapping.
4. Validate declaration generation, consumer imports, and the core/client suites; address actual compatibility failures without weakening assertions.

The TypeScript 7 declaration integration is documented as experimental by the upstream plugin. The client build remains outside this migration.

## Final migration results

- Installed tsdown 0.23.1 with its native TypeScript 7 declaration generator. Removed tsup from the core development dependencies; the client retains tsup.
- Added `nile/tsdown.config.ts`, preserved `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, and `dist/index.d.cts`, and enabled matching JavaScript and declaration source maps. Explicit declaration maps prevent references to missing map files.
- Moved the previous `nile/tsup.config.ts` to `/home/kizz/CODE/new-nile/trash/dependency-upgrade-2026-10-16/tsup.config.ts` after backing it up.
- Removed only `baseUrl` from the core TypeScript configuration. Existing `@/*` paths still resolve relative to the configuration.
- Updated the root development guide with the core build tool and supported Node.js versions.
- Release build passed using TypeScript 7.0.2. Source and build-config type checking passed.
- Core: 338 tests passed across 17 files. Client: 26 tests passed across 3 files.
- Targeted lint checks passed for the modified core manifest and build configuration.
- Node ESM and CommonJS consumers successfully imported the built package and executed an action.
- Consumer declarations passed strict checks with bundler module resolution, matching Nile's configuration. All declaration export names from the previous build are preserved.

## Limitations recorded before the Slang 0.0.9 follow-up

- Full-project `tsc --noEmit` reports nine diagnostics in existing test fixtures. Each also reproduces under TypeScript 5.9.3 with the upgraded dependencies; TypeScript 5 additionally reports middleware callback diagnostics. The release source type check passes. These fixture diagnostics were documented rather than hidden or suppressed.
- Historical Slang 0.0.8 limitation, addressed upstream in the follow-up below: strict NodeNext consumers failed on `slang-ts@0.0.8` declarations because its declaration barrel re-exports `./src` without an explicit extension. Both the previous and new Nile declarations import those Slang types. Bundler-resolution consumers and actual ESM/CommonJS runtime imports pass. At that stage, fixing Slang required a separate upstream change; no dependency files were patched. Slang 0.0.9 now includes that upstream fix, with current Nile consumer verification recorded below.
- Historical peer limitation: Slang 0.0.8 declared a TypeScript 5.9.3 peer range. Slang 0.0.9 now declares `^5.9.3 || ^7.0.2`, resolving this metadata mismatch without overrides.
- The declaration plugin describes TypeScript 7 integration as experimental. No package has been published or version bumped.

## Changed files

- `packages/nile/package.json`
- `packages/nile/tsconfig.json`
- `packages/nile/tsdown.config.ts` (new)
- `packages/nile/tsup.config.ts` (moved to project trash)
- `packages/nile/dist/` (regenerated release files and source maps)
- `bun.lock`
- `dev.md`
- `packages/dependency-upgrade-plan.md` (new)

All pre-existing edited or replaced files were backed up before changes. The logger fixture was restored after tests.

## Reflection

Baseline tests made the dependency comparison reliable. Checking the actual release build caught the legacy compiler API failure that runtime tests alone missed. Consumer checks established the distinction between a working Nile migration and the upstream Slang NodeNext declaration issue. Future dependency upgrades should include release-source and consumer checks alongside runtime suites, especially when crossing a compiler major version.

## Published Slang 0.0.9 follow-up

The user published Slang 0.0.9 and asked to return to Nile. Nile core now declares `slang-ts: ^0.0.9`, installed from the public registry through Bun. The published JavaScript and declarations are byte-identical to the reviewed local Slang build. Slang 0.0.9 includes bundled NodeNext-compatible declarations, TypeScript 7 peer support, and the approved recursive `safeTry` behavior. Existing ordinary payloads remain unchanged; nested success wrappers now resolve to their terminal value, and nested failures become the outer failure.

The workspace lockfile changes only Nile's Slang range and the Slang resolution metadata and integrity. The example package's Slang 0.0.7 dependency remains unchanged. Nile source helpers are unmodified, and no dependency files are patched.

Pre-change files and the intent are preserved in `/home/kizz/CODE/new-nile/backup/slang-0.0.9-upgrade-2026-10-16/`. Previous core build output is preserved at `/home/kizz/CODE/new-nile/trash/slang-0.0.9-upgrade-2026-10-16/dist/` before regeneration.

Verification against the published Slang 0.0.9 package is complete:

- All 338 core tests across 17 files and 26 client tests across 3 files pass.
- The TypeScript 7/tsdown release build passes for ESM and CommonJS JavaScript, declarations, and source maps. All eight regenerated files are byte-identical to the previous Nile output.
- Strict NodeNext and Bundler consumer checks pass with declaration checking enabled (`skipLibCheck: false`). The earlier Slang declaration blocker is resolved.
- Nile source and build-configuration type checks pass. Node ESM/CommonJS action, service, and recursive `safeTry` checks pass.
- Targeted lint checks for the core manifest and tsdown configuration pass.
- Full-project type checking still reports exactly the same nine existing test-fixture diagnostics, with matching locations and codes. No new diagnostics appear; this is not a clean full-project type check.
- The logger fixture is restored byte-identically. Reports, fixtures, and logs are preserved in the backup's `verification/` directory.

Changed files for this follow-up: `packages/nile/package.json`, root `bun.lock`, and `packages/dependency-upgrade-plan.md`. Build output was regenerated and verified without content changes. All edited existing files were backed up before changes. No Nile release, version bump, commit, or push is included.

Checking the published artifact against the reviewed build and testing real package consumers closed the upstream declaration blocker without local dependency patches. The remaining fixture diagnostics are separate from this dependency upgrade.
