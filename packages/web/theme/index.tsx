import { useEffect } from "react";
import { Layout as OriginalLayout } from "@rspress/core/theme-original";
import "./index.css";

// Re-export everything from the original theme
export * from "@rspress/core/theme-original";

const CONTEXT7_SRC = "https://context7.com/widget.js";
const CONTEXT7_LIBRARY = "/nile-js/nile";

/** Root layout wrapper that injects the Context7 chat widget script */
export function Layout() {
  useEffect(() => {
    if (document.querySelector(`script[src="${CONTEXT7_SRC}"]`)) {
      return;
    }

    const script = document.createElement("script");
    script.src = CONTEXT7_SRC;
    script.dataset.library = CONTEXT7_LIBRARY;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, []);

  return <OriginalLayout />;
}
