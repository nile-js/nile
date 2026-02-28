import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Check if a path exists (sync for quick guard checks) */
export const pathExists = (path: string): boolean => existsSync(path);

/** Create a directory and all parent directories */
export const ensureDir = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true });
};

/** Write content to a file, creating parent directories if needed */
export const writeFileSafe = async (
  filePath: string,
  content: string
): Promise<void> => {
  await ensureDir(dirname(filePath));
  await writeFile(filePath, content, "utf-8");
};

/** Read a file as UTF-8 string */
export const readFileContent = (filePath: string): Promise<string> => {
  return readFile(filePath, "utf-8");
};

/**
 * Recursively copy a directory tree.
 * Uses Node.js native recursive copy (Node 16.7+).
 */
export const copyDir = async (src: string, dest: string): Promise<void> => {
  await cp(src, dest, { recursive: true });
};

/**
 * Get all file paths recursively in a directory.
 * Returns paths relative to the given root.
 */
export const getFilesRecursive = async (
  dir: string,
  root?: string
): Promise<string[]> => {
  const base = root ?? dir;
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await getFilesRecursive(fullPath, base);
      files.push(...nested);
    } else {
      files.push(fullPath);
    }
  }

  return files;
};

/**
 * Replace all occurrences of a placeholder in file content.
 * Reads the file, replaces, and writes back.
 */
export const replaceInFile = async (
  filePath: string,
  replacements: Record<string, string>
): Promise<void> => {
  let content = await readFileContent(filePath);
  for (const [placeholder, value] of Object.entries(replacements)) {
    content = content.replaceAll(placeholder, value);
  }
  await writeFile(filePath, content, "utf-8");
};

export { dirname, join } from "node:path";
