---
title: "Nile Js skill"
description: "Install the SKILL.md file that ships with @nilejs/nile so a coding assistant follows Nile Js conventions"
---

The Nile Js skill is one Markdown file that teaches a coding assistant how a Nile Js project is organized and how to change it safely. It ships inside the `@nilejs/nile` package, so the copy in your project always matches the version you installed.

## What the skill covers

- The project layout of a CLI starter and where the service registry lives.
- The action pattern: a named Zod schema, an inferred input type, a named handler and `createAction<T>`.
- That handlers receive `(data, context)`, and which context fields to use.
- Results, the HTTP response envelope and the per-field `data.issues` on validation failures.
- Calling actions over HTTP, with `@nilejs/client` and with `server.invoke`.
- Authentication, hooks and discovery rules.
- Links to every [feature page](/guide/features).
- Rules for agents, such as reading `services.config.ts` first and type-checking after every edit.
- Common pitfalls, such as `accessControl` not blocking anything without a hook.

## Find the file

After `bun install`, the skill is in your project at:

```text
node_modules/@nilejs/nile/SKILL.md
```

Open it to see exactly what your assistant will read. The file starts with `name`, `description` and `license` fields that skill-aware assistants use to decide when to load it.

## Install it for Claude Code

Claude Code loads project skills from `.claude/skills/<name>/SKILL.md`. The skill's name is `nile`, so create that folder and link the file from the package:

```sh
mkdir -p .claude/skills/nile
ln -s ../../../node_modules/@nilejs/nile/SKILL.md .claude/skills/nile/SKILL.md
```

You should see `.claude/skills/nile/SKILL.md` pointing at the package file. The link follows upgrades automatically. If your setup does not allow symbolic links, copy the file instead and copy it again after each upgrade:

```sh
cp node_modules/@nilejs/nile/SKILL.md .claude/skills/nile/SKILL.md
```

Commit the `.claude/skills/nile/` folder so everyone on the team gets the same instructions.

## Use it with other assistants

Assistants that read an `AGENTS.md` file, or their own rules file, can follow the skill through a short instruction. Add this to `AGENTS.md` in the project root:

```text
Before changing the backend, read node_modules/@nilejs/nile/SKILL.md and follow it.
```

For an assistant without file access, paste the contents of `SKILL.md` into its project instructions.

## Keep it current

The skill describes the installed release. After you upgrade `@nilejs/nile`, a linked skill updates by itself; a copied skill needs to be copied again. When the skill and your code disagree, trust the code and the installed types, and tell the assistant which one is right.

## See also

- [Build with AI agents](/guide/agents)
- [Documentation for coding agents](/guide/reference/llms-txt)
- [Discovery and agents](/guide/basics/discovery-and-agents)
