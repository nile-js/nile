import { createInterface } from "node:readline";

/**
 * Prompt the user with a yes/no question.
 * Returns true for yes, false for no.
 * Defaults to the provided default value on empty input.
 */
export const confirmPrompt = (
  question: string,
  defaultYes = true
): Promise<boolean> => {
  const suffix = defaultYes ? "[Y/n]" : "[y/N]";

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`  ${question} ${suffix} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") {
        resolve(defaultYes);
        return;
      }
      resolve(trimmed === "y" || trimmed === "yes");
    });
  });
};
