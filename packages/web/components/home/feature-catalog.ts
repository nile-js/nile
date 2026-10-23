import {
	Activity,
	Boxes,
	Braces,
	Clock3,
	Database,
	FileUp,
	Fingerprint,
	Gauge,
	Layers3,
	ListOrdered,
	Radio,
	Repeat2,
	Route,
	ScanSearch,
} from "lucide-react";

/**
 * Shipped capabilities under their technical names, in bento order. Wide cards
 * place code beside the copy; the order keeps every three-column row full.
 */
export const FEATURES = [
	{
		key: "results",
		icon: Braces,
		title: "Validation and error handling",
		description:
			"Zod validates input before your handler runs. Results keep expected errors beside the happy path.",
		guide: "/guide/features/validation-and-errors",
		size: "single",
		tone: "sky",
	},
	{
		key: "policies",
		icon: Fingerprint,
		title: "Authentication and hooks",
		description:
			"Verify JWTs on protected actions and run a global hook before every action. Your application owns the rules.",
		guide: "/guide/features/authentication-and-hooks",
		size: "wide",
		tone: "indigo",
	},
	{
		key: "context",
		icon: Layers3,
		title: "Context and logging",
		description:
			"Share resources once. Each call keeps its own session, and logs carry request IDs.",
		guide: "/guide/features/context-and-logging",
		size: "single",
		tone: "teal",
	},
	{
		key: "controls",
		icon: ListOrdered,
		title: "Queues, debounce and throttle",
		description:
			"Queue, debounce, throttle or batch ordinary functions with limited concurrency.",
		guide: "/guide/features/queues-debounce-throttle",
		size: "single",
		tone: "blue",
	},
	{
		key: "telemetry",
		icon: Activity,
		title: "Telemetry",
		description:
			"Readable logs first. Export OpenTelemetry traces and metrics when you need them.",
		guide: "/guide/features/telemetry",
		size: "single",
		tone: "cyan",
	},
	{
		key: "sockets",
		icon: Radio,
		title: "WebSockets",
		description:
			"Typed topics validate every message before Socket.IO delivers it. Invoke actions with the dedicated socket client.",
		guide: "/guide/features/websockets",
		size: "wide",
		tone: "sky",
	},
	{
		key: "schedules",
		icon: Clock3,
		title: "Cron jobs",
		description:
			"Run jobs at midnight, weekly, once, on an interval or with a cron expression, in a real timezone.",
		guide: "/guide/features/cron-jobs",
		size: "single",
		tone: "teal",
	},
	{
		key: "models",
		icon: Database,
		title: "Database models",
		description:
			"Optional Drizzle helpers return Results from CRUD and generate reusable Zod schemas.",
		guide: "/guide/features/database-models",
		size: "single",
		tone: "blue",
	},
	{
		key: "contracts",
		icon: ScanSearch,
		title: "API discovery and schemas",
		description:
			"Opt-in discovery lists actions and their schemas. Export them so the CLI can generate input types.",
		guide: "/guide/features/api-discovery",
		size: "single",
		tone: "indigo",
	},
	{
		key: "interfaces",
		icon: Route,
		title: "HTTP, WebSocket and direct calls",
		description:
			"Call the same action over HTTP, sockets or directly in your backend. Run on Bun native or Hono.",
		guide: "/guide/features/calling-actions",
		size: "single",
		tone: "cyan",
	},
	{
		key: "helpers",
		icon: Repeat2,
		title: "Retries and utilities",
		description:
			"Jittered retries, bounded TTL storage and safe database calls under one utils namespace.",
		guide: "/guide/features/retries-and-utilities",
		size: "single",
		tone: "sky",
	},
	{
		key: "quotas",
		icon: Gauge,
		title: "Rate limiting",
		description:
			"Share one action quota across HTTP, sockets and direct calls. Fixed or sliding windows, token buckets and cooldowns.",
		guide: "/guide/features/rate-limiting",
		size: "wide",
		tone: "blue",
	},
	{
		key: "files",
		icon: FileUp,
		title: "File uploads",
		description:
			"Multipart uploads arrive as actions, with file count, size and type limits. Serve static files when useful.",
		guide: "/guide/features/file-uploads",
		size: "wide",
		tone: "teal",
	},
	{
		key: "lifecycle",
		icon: Boxes,
		title: "Readiness and graceful shutdown",
		description:
			"Startup stats, readiness checks and a shutdown that finishes accepted work.",
		guide: "/guide/features/readiness-and-shutdown",
		size: "single",
		tone: "indigo",
	},
] as const;
