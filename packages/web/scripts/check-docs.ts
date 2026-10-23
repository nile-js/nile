import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const ROOT = resolve("docs/guide");

/** Enforce the conventions contributors can check before building the website. */
async function checkDocs(): Promise<void> {
	const files = (await readdir(ROOT, { recursive: true })).filter((name) =>
		/\.mdx?$/.test(name),
	);
	const failures: string[] = [];
	await Promise.all(
		files.map(async (name) => {
			const file = resolve(ROOT, name);
			const content = await readFile(file, "utf8");
			const frontmatter = /^---\n([\s\S]*?)\n---\n/.exec(content);
			if (
				!(
					frontmatter &&
					/^title: .+/m.test(frontmatter[1]) &&
					/^description: .+/m.test(frontmatter[1])
				)
			) {
				failures.push(`${name}: title and description frontmatter required`);
			}
			let inCode = false;
			let previousLevel = 1;
			for (const [index, line] of content.split("\n").entries()) {
				if (line.startsWith("```")) {
					if (!inCode && !/^```[a-z][\w-]*(?:\s.*)?$/i.test(line))
						failures.push(`${name}:${index + 1}: code block needs a language`);
					inCode = !inCode;
					continue;
				}
				if (inCode) continue;
				if (line.includes("—"))
					failures.push(
						`${name}:${index + 1}: use ordinary punctuation in prose`,
					);
				const heading = /^(#{1,6}) /.exec(line);
				if (heading) {
					const level = heading[1].length;
					if (level === 1)
						failures.push(
							`${name}:${index + 1}: page title comes from frontmatter`,
						);
					if (level > previousLevel + 1)
						failures.push(`${name}:${index + 1}: heading level skipped`);
					previousLevel = level;
				}
				for (const match of line.matchAll(/\]\(([^)]+)\)/g)) {
					const target = match[1].split("#")[0];
					if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
					if (/^\/(?:nile\/)?(?:llms|benchmarks|markdown)/.test(target))
						continue;
					const path = target.startsWith("/guide/")
						? resolve(ROOT, target.slice(7))
						: target.startsWith("/")
							? undefined
							: resolve(dirname(file), target);
					if (!path) {
						failures.push(
							`${name}:${index + 1}: unrecognized local link ${target}`,
						);
						continue;
					}
					const slugs = files.map((entry) =>
						resolve(ROOT, entry).replace(/\.mdx?$/, ""),
					);
					const normalized = path.replace(/\.mdx?$/, "").replace(/\/$/, "");
					if (
						!slugs.includes(normalized) &&
						!slugs.includes(`${normalized}/index`)
					)
						failures.push(`${name}:${index + 1}: missing page ${target}`);
				}
			}
			if (inCode) failures.push(`${name}: unclosed code block`);
		}),
	);
	if (failures.length > 0) throw new Error(failures.sort().join("\n"));
	console.info(`Documentation checks passed for ${files.length} pages.`);
}

await checkDocs();
