import pc from "picocolors";

/** Log a success message with a green checkmark */
export const success = (msg: string) => console.log(pc.green(`  ✓ ${msg}`));

/** Log an info message in cyan */
export const info = (msg: string) => console.log(pc.cyan(`  ${msg}`));

/** Log a warning message in yellow */
export const warn = (msg: string) => console.log(pc.yellow(`  ⚠ ${msg}`));

/** Log an error message in red */
export const error = (msg: string) => console.error(pc.red(`  ✗ ${msg}`));

/** Log a bold header */
export const header = (msg: string) => console.log(`\n${pc.bold(msg)}\n`);

/** Log a dimmed hint line */
export const hint = (msg: string) => console.log(pc.dim(`    ${msg}`));
