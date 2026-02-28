import pc from "picocolors";

/** Print the branded Nile header */
export const brand = () => console.log(`\n  ${pc.bold(pc.cyan("~ Nile"))}\n`);

/** Print the closing tagline */
export const outro = () =>
  console.log(pc.dim("\n  Happy hacking. Let code flow like river Nile.\n"));

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

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Create a terminal spinner with animated dots.
 * Returns a stop function that replaces the spinner with a final message.
 */
export const createSpinner = (msg: string) => {
  let i = 0;
  const stream = process.stdout;

  const id = setInterval(() => {
    const frame = SPINNER_FRAMES[i % SPINNER_FRAMES.length];
    stream.write(`\r  ${pc.cyan(frame)} ${msg}`);
    i++;
  }, 80);

  return {
    /** Stop the spinner and print a final success message */
    stop: (finalMsg: string) => {
      clearInterval(id);
      stream.write(`\r  ${pc.green("✓")} ${finalMsg}\n`);
    },
  };
};
