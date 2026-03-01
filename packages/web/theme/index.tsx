import { Layout as OriginalLayout } from "@rspress/core/theme-original";
import "./index.css";

// Re-export everything from the original theme
export * from "@rspress/core/theme-original";

// TODO: Uncomment once Context7 domain whitelist is configured
// const CONTEXT7_SRC = "https://context7.com/widget.js";
// const CONTEXT7_LIBRARY = "/nile-js/nile";

/** Root layout wrapper — Context7 chat widget injection ready */
export function Layout() {
  // TODO: Uncomment once Context7 domain whitelist is configured
  // useEffect(() => {
  //   if (document.querySelector(`script[src="${CONTEXT7_SRC}"]`)) {
  //     return;
  //   }
  //   const script = document.createElement("script");
  //   script.src = CONTEXT7_SRC;
  //   script.dataset.library = CONTEXT7_LIBRARY;
  //   script.async = true;
  //   document.body.appendChild(script);
  //   return () => {
  //     script.remove();
  //   };
  // }, []);

  return <OriginalLayout />;
}
