import { sign } from "hono/jwt";
import {
	createDefinitions,
	createStore,
	CUSTOMER,
	SECRET,
	ORIGIN,
	SHOPS,
	OPERATIONS,
} from "../workload.mjs";

export const ENTRIES = [
	"nile-published",
	"nile-current-native",
	"nile-current-hono",
];

/** Use the actual published/current constructors with the same workload, schemas, credentials and native response contract. */
export async function createComparisonFixture(name, mode) {
	if (!(ENTRIES.includes(name) && ["plain", "validated"].includes(mode))) {
		throw new Error("Invalid comparison fixture");
	}
	const path =
		name === "nile-published"
			? "../published/node_modules/@nilejs/nile/dist/index.js"
			: "../../../../nile/dist/index.js";
	const { createNileServer } = await import(
		new URL(path, import.meta.url).href
	);
	const store = createStore();
	const definitions = createDefinitions();
	const token = await sign(
		{
			sub: CUSTOMER,
			organizationId: "benchmark",
			exp: Math.floor(Date.now() / 1000) + 3600,
		},
		SECRET,
		"HS256",
	);
	const native = name === "nile-current-native";
	const server = await createNileServer({
		serverName: "Published versus current ecommerce",
		runtime: "bun",
		...(native ? { native: true } : {}),
		forceNewInstance: true,
		logServices: false,
		auth: { secret: SECRET },
		rest: { baseUrl: "/api", allowedOrigins: [ORIGIN] },
		services: SHOPS.map((shop) => ({
			name: shop,
			description: "Storefront",
			actions: OPERATIONS.map((operation) => {
				const definition = definitions.find(
					(entry) => entry.shop === shop && entry.operation === operation,
				);
				return {
					name: operation,
					description: operation,
					isProtected: true,
					...(mode === "validated" ? { validation: definition.schema } : {}),
					handler: (payload, context) =>
						store.execute(
							shop,
							operation,
							payload,
							context.getSession("rest")?.userId,
						),
				};
			}),
		})),
	});
	if (native && !server.nativeRest?.fetch) {
		throw new Error("Current native adapter missing");
	}
	const fetch = native
		? server.nativeRest.fetch
		: (request) => server.rest.app.fetch(request);
	return {
		headers: {
			origin: ORIGIN,
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
		},
		routeCount: definitions.length,
		reset: store.reset,
		state: store.state,
		start: () => {
			const listener = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch });
			return {
				url: String(listener.url).slice(0, -1),
				close: () => listener.stop(true),
			};
		},
	};
}
