import { useEffect, useState } from "react";

const RESET_AFTER_MS = 1800;

/** Translate a browser permission failure into feedback without throwing from an event. */
function safeTry<T>(operation: () => Promise<T>) {
	return Promise.resolve()
		.then(operation)
		.then(
			(data) => ({ status: true as const, data }),
			() => ({ status: false as const, message: "Select the code to copy it" }),
		);
}

/** Keep copying optional: code remains selectable when clipboard permission is unavailable. */
export function CopyButton({ text }: { text: string }) {
	const [feedback, setFeedback] = useState("Copy");
	const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

	useEffect(() => {
		if (state !== "copied") {
			return;
		}
		const timer = window.setTimeout(() => {
			setState("idle");
			setFeedback("Copy");
		}, RESET_AFTER_MS);
		return () => {
			window.clearTimeout(timer);
		};
	}, [state]);

	const copy = async () => {
		const result = await safeTry(() => navigator.clipboard.writeText(text));
		if (result.status) {
			setFeedback("Copied");
			setState("copied");
			return;
		}
		setFeedback(result.message);
		setState("failed");
	};

	return (
		<button
			className="nile-copy"
			onClick={copy}
			type="button"
			data-state={state}
			aria-live="polite"
			aria-label={`${feedback} code`}
		>
			{feedback}
		</button>
	);
}
