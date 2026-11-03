---
title: "Choosing Nile"
description: "Choose an application model around the work your team needs to ship"
---

Choose Nile when a small team wants a consistent place for each new operation, with its domain logic kept in ordinary TypeScript functions.

A service groups related actions. Each action names an operation, can validate its input and returns an explicit Result. Shared context and hooks let the team apply dependencies and policies consistently. Learn one operation’s shape, then follow the same path through the next domain.

## Decide from the work you need to do

| What matters to your team | What Nile offers | What to consider |
| --- | --- | --- |
| Finding and extending existing behavior | Services and named actions organized around domains | Your team still chooses useful boundaries and names. |
| Keeping failure paths understandable | `Ok`/`Err`, guarded handlers and configured error logging | Decide which failures are expected and what information is safe to expose. |
| Sharing policies across operations | Global hooks and action-level pipelines | Authorization policy is application code, not an automatic interpretation of metadata. |
| Keeping frontend calls consistent | A fetch-based client and generated input types | Output types are not automatically inferred from handlers. |
| Letting tools inspect operations | Opt-in discovery and JSON Schema export | Tool adapters, credentials and permissions remain your responsibility. |
| Using existing libraries | Resources supplied through context and ordinary modules | Nile does not provision infrastructure or manage your database lifecycle. |

## Compare programming models, not checkmarks

[Elysia](https://elysiajs.com/), [Hono](https://hono.dev/), [Fastify](https://fastify.dev/) and [Express](https://expressjs.com/) are worth evaluating when HTTP route design is central to your application. Nile’s action interface addresses business operations through one configured POST endpoint. Custom routes cover the cases needing their own URL; actions themselves stay behind the one POST endpoint, so HTTP GET caching never applies to them.

[tRPC](https://trpc.io/) is worth evaluating when inferred server/client types are a primary requirement. Nile uses a different flow: optional runtime schema discovery, CLI-generated input types and a client that accepts those types. Nile's client types payloads only; response types stay unknown until you validate them.

[NestJS](https://nestjs.com/), [AdonisJS](https://adonisjs.com/) and [Encore](https://encore.dev/ts) offer their own application conventions and tooling. [Effect](https://effect.website/) has its own model for errors, dependencies and execution. Evaluate those models against how your team wants to work. Nile’s particular choice is a functional service/action structure with a small set of common execution patterns.

For flexible consumer-defined data queries, evaluate whether a GraphQL API fits better than a named operation interface.

## The constraints to understand

- Services and actions are registered at startup; adding one means restarting the server.
- Built-in action input validation uses Zod. Keep the handler’s declared input type aligned with its schema.
- Expected failures use Results, but invalid setup and some lower-level utilities can throw.
- Discovery is off by default. It describes actions for tool integrations you build, such as an agent.
- Direct calls share the engine with HTTP. See [production operations](/guide/reference/operations) for transport setup, lifecycle, scheduling and observability. Use typed Socket.IO topics for live updates. Custom HTTP routes can return streaming responses.
- General context keys and resources are shared. Request sessions and action hook state belong to one call and live in memory only.

## Try a representative operation

Build something your team actually needs: create a project, approve a request or change a billing plan. Follow it from input to policy, domain function, data access and frontend call, and judge the fit from that.

Start with [application structure](/guide/start/application-structure), then review [errors and Results](/guide/basics/errors-and-results), [hooks](/guide/basics/hooks-and-pipelines) and [runtime adapters](/guide/start/runtime-adapters).

The [recorded benchmark](/guide/reference/performance) covers performance for one workload on one machine.
