# Agent Coding Rules

## Core Rules

- ❌ No classes, No OOP - Use functions, factories and modern simple patterns
- ✅ ES6+, max 400 LOC/file, functional composition
- ✅ Group by domain, use barrel files where needed (`index.ts`)
- ✅ Names: `verbNoun`, `isActive`, `CONSTANTS`, `kebab-case.ts`
- All re-usable functions should have js docs and also useful comments should be provided in cases where intent of code block may not obvious to reviewer.
- Any errors that are due to missing dependencies or because developer made an error or something critical to system should be thrown right away and fast but errors usually anticipated by guard clauses and runtime or due to user input should be handled gracefully following codebase erorr handling patterns, mostly not thrown but returned gracefully.

## Key Patterns

- Single responsibility: One function does one thing well
- Dependency injection: Pass dependencies as parameters, not hard imports
- Early returns: Use guard clauses, avoid nested conditions
- Error handling: Always use safeTry pattern for operations that can fail instead of try catch mess
- Object lookups: Use objects instead of switch statements for cleaner dispatch
- Result pattern: Always return `{ status: true; data: T }` or `{ status: false; message: string }`
- Split modules into own seperate files, under a domain folder eg. /users and then in there you can have get-users.ts, update-users.ts etc and then finally an index.ts file which exports all of them, this helps keep code modular and maintainable.
- Code for humans, make code readable and well composed small function vs one big monoliths, no complex code or so in sacrfice of readability and ease of maintenance.
- Defensive programming: Anticipate potential errors and handle them gracefully, for critical issues that may do more harm or crush system, fail fast, throw right away, anticipate runtime errors and missing dependencies, anticipate failure so that nothing fails.
- For any issues or errors that concern db, or affect architecture and change of core pieces or any additions in tech stack must be approved, don't install anything without permission or change any core files or stack or configurations without approval.

## Legacy Code

- Ask owner before changing. Test current behavior first. Document in task.md
- Don't assume "bugs" are bugs, investigate original intention and relevance

## Quick Rules

- Group related functions with clear dependencies. Extend via composition, not modification
- JSDoc for public APIs, explain WHY not what. Unit tests for logic, integration for APIs
- Create task.md for work >30min. Use `{ name, email }` not `(name, email, ...)`
- Prefer `.filter().map()` over for loops. Always use utilities like safeTry for error handling

## React Rules

- Extract custom hooks. Move state logic to hooks, keep components pure presentational
- Prop drilling max 2 levels. Use context/state management beyond 2 component levels
- Always check `data?.length > 0` before `.map()`. Containers handle state, Pure components only render props
- `/customers` page components go in `components/customers/`. Use `useMemo`, `useCallback`, `React.memo` for expensive operations
- Build complex UIs from small, focused components

## Essential Utility

```ts
export function safeTry<T>(fn: () => T | Promise<T>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(value => ({ err: null, result: value }))
        .catch(error => ({ err: error, result: null }));
    }
    return { err: null, result };
  } catch (error) {
    return { err: error, result: null };
  }
}
```

- I am always the one to start servers, not you, you ask me!
- Am also one to approve any db related commands
- Use pnpm not npm
- Always first copy files to /backup if your to make changes more than 10 lines
- And for files where a backup is needed, also create an accompanying intent.md which documents the purpose and scope of the changes that you intent to make and also include my orignal intent as well.
- Always approach things systematically, step by step, use a todo if you should also always understand things from flow, not just the individual parts, trace an implementation before you make any assumptions.
- Not all changes need creating new stuff all together or full replacing, first try to work with what is in place and then if not viable first suggest before full redo.
- Always read files before making changes or ask user if they had changed anything since your last edit where such case makes sense.

You can always read relevant docs in /docs or AGENT md file at root or ask me if needed for more context on issue at hand or task.

Important: I make all db level and any db related commands and decisions, you always ask me when it comes to database stuff.

Always examine existing codebase patterns before implementing new solutions - use existing patterns where possible.

## General Approach And Methodology

• Reflection - Always critique yourself after task in terms of how did you approach the problem, what worked well, and what could be improved and how much did you follow my instructions and what did you learn moving forward you can even play Senior QA engineer role to get this well.
• Tool use - know your tools and use any mcps available where needed
• Planning - always plan first, create taskName-plan.md files if needed, break down complex tasks into small manageable tasks and phases.
• Multi-agent collaboration - collaborate, and deligate tasks to other agents if possible where needed.

- Document all changes made to the codebase, including the reasoning behind them and any potential impacts on existing functionality especially for complex tasks or changes, use .md files as needed write the docs in plain markdown.
- Ocam's Razor - Prefer the simplest solution that works. If you have two solutions, the simpler one is usually better. You can always add complexity later if needed.
- For changes always first make copies in /backup and for deleting never use rm command, instead move things to /trash we shall count them as deleted and i will delete them myself manually -- this is the most important rule of all.
- Always approach tasks systematically, you don't implement before planning, don't rush!
- Don't implement wanna be and suggested and not approved features or code stubs and unneeded comments, just focus on current task and its scope only, don't include features not requested for and also comments should be thoughtful not just commenting everywhere unneeded.
- Better yet whenever I provide strategy, it is meant to be followed exactly with no additions or reductions or change of plans, follow my words exactly and suggest before doing if you believe you have a better way, I have to approve first.
- Always list all modified files after a given task and confirm that you had backend them up.
- Touching /backend and /nile code, or anything in frontend/api directory requires special attention and approval. Don't ever touch those files without consulting me first.
- Reading docs and getting context saves mistakes, so read any relevant docs in /docs always on start to understand what is going on, sometimes  other files are on project root (.md files), or you can always ask me for clarification on which of the found documents are relevant if not sure, don't just read everything as well.
- it's always the test to match the implementation not other way round, and tests should not cheat edge cases and testing requirements just to pass.
- Always prefer concise and contextual clarity than verbosity of explanation, be brief as needed.
- Always avoid hacky ways around problems, avoid shortcuts and stubs and being lazy on tasks and taking just the easy way around, we working on production grade stuff, so we have to do real things as they should be, we don't skip stuff or instead of fundamentally fixing things and we just make shims, resolvers or quick ways that don't fix the root problem, in doubt where you think we may need to take the easy way, first ask.
- Never rush to implementing or changing things while we still working, I have to approve first.
- Never use git without my supervision, always ask me before any git commands.
- Avoid using any, and unknown types, usually types are already defined in the codebase or you can use generics and some typescript utilities, also pattern prefered is domain/module-name.ts and domain/types.ts for types, and then index.ts for barrel files, so always check those places before adding new types or any types at all.
- Unless you can do much better, always try to work with existing code and patterns, don't just add new stuff or change things without first trying to work with what is already there, and if you think you need to change or add something first suggest before doing it, ideally your code style and taste should match mine.

Always remember these rules before working on any new tasks.