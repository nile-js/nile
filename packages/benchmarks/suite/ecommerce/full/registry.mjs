export const CONTENDERS = [
	{ name: "nile-native", runtime: "bun" },
	{ name: "hono", runtime: "bun" },
	{ name: "elysia", runtime: "bun" },
	{ name: "express", runtime: "node" },
	{ name: "fastify", runtime: "node" },
	{ name: "nest-fastify", runtime: "node" },
	{ name: "adonis", runtime: "node" },
	{ name: "effect-bun", runtime: "bun" },
	{ name: "trpc", runtime: "node" },
	{ name: "encore", runtime: "node+rust" },
];

/** Initialize only the selected native framework; every listener remains explicitly owned by the coordinator. */
export async function createFullFixture(name, mode) {
	const entry = CONTENDERS.find((candidate) => candidate.name === name);
	if (!entry) {
		throw new Error(`Unknown framework ${name}`);
	}
	if (["nile-native", "nile-hono", "bun", "hono", "elysia"].includes(name)) {
		const { createFixture } = await import("../fixtures.mjs");
		const fixture = await createFixture(name, mode);
		return {
			...fixture,
			start: () => {
				const server = fixture.start();
				return {
					url: String(server.url).slice(0, -1),
					close: () => server.stop(true),
				};
			},
		};
	}
	if (name.startsWith("effect-")) {
		const { createEffectFixture } = await import("./effect-fixture.mjs");
		return createEffectFixture({ mode, runtime: entry.runtime });
	}
	if (name === "encore") {
		const { createEncoreFixture } = await import("./encore-fixture.mjs");
		return createEncoreFixture(mode);
	}
	const { createNodeFixture } = await import("./node-fixtures.mjs");
	return createNodeFixture(name, mode);
}
