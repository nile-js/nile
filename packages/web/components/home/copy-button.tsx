import { useState } from "react";

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
	const copy = async () => {
		const result = await safeTry(() => navigator.clipboard.writeText(text));
		setFeedback(result.status ? "Copied" : result.message);
	};
	return (
		<button
			className="nile-copy"
			onClick={copy}
			type="button"
			aria-live="polite"
			aria-label={`${feedback} code`}
		>
			{feedback}
		</button>
	);
}
