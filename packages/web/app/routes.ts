import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("guide/roadmap", "routes/roadmap.ts"),
	route("guide/*", "routes/docs.tsx"),
	route("api/search", "routes/search.ts"),
	route("llms.txt", "routes/llms-index.ts"),
	route("llms-full.txt", "routes/llms-full.ts"),
	route("markdown/*", "routes/markdown.ts"),
	route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
