import { join } from "node:path";
import { defineConfig } from "@rspress/core";
import { pluginLlms } from "@rspress/plugin-llms";

export default defineConfig({
  root: join(__dirname, "docs"),
  base: "/nile/",
  title: "Nile",
  description:
    "TypeScript-first, service and actions oriented backend framework",
  icon: "/rspress-icon.png",
  logoText: "🌊 Nile",
  head: [
    '<script src="https://context7.com/widget.js" data-library="/nile-js/nile"></script>',
  ],
  plugins: [
    pluginLlms({
      exclude: ({ page }) => {
        // Exclude roadmap page from llms.txt generation
        return page.routePath === "/guide/others/roadmap";
      },
    }),
  ],
  themeConfig: {
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/nile-js/nile",
      },
    ],
    // Built-in search is enabled by default
    search: true,
    llmsUI: true,
  },
  markdown: {
    showLineNumbers: true,
    shiki: {
      theme: "material-theme-ocean",
    },
    link: {
      checkDeadLinks: {
        excludes: ["/llms.txt", "/llms-full.txt"],
      },
    },
  },
});
