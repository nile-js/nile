import { useEffect } from "react";

const REVEAL_SELECTOR = "[data-reveal]";

/**
 * Reveal marked elements as they scroll into view. Content stays visible when
 * JavaScript is unavailable or the visitor prefers reduced motion.
 */
export function HomeMotion() {
	useEffect(() => {
		const root = document.querySelector<HTMLElement>(".nile-home");
		const prefersReducedMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		const canObserve = "IntersectionObserver" in window;
		if (root === null || prefersReducedMotion || !canObserve) {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						entry.target.classList.add("is-revealed");
						observer.unobserve(entry.target);
					}
				}
			},
			// A small fixed margin keeps reveals reachable for short elements at the very bottom.
			{ rootMargin: "0px 0px -40px 0px", threshold: 0.1 },
		);
		for (const target of root.querySelectorAll(REVEAL_SELECTOR)) {
			observer.observe(target);
		}
		root.classList.add("nile-motion");
		return () => {
			observer.disconnect();
			root.classList.remove("nile-motion");
		};
	}, []);
	return null;
}
