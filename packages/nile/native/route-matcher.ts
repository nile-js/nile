const PARAMETER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const REGEXP_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

/** Compile named parameters and terminal wildcards once; optional parameters include their slash. */
export function compilePathPattern(pattern: string): {
  expression: RegExp;
  names: string[];
} {
  const names: string[] = [];
  const segments = pattern.split("/");
  const expression = segments
    .map((segment, index) => {
      const separator = index === 0 ? "" : "/";
      if (segment === "*") {
        if (index !== segments.length - 1) {
          throw new Error("Native route wildcards must be terminal");
        }
        return `${separator}.*`;
      }
      if (segment.startsWith(":")) {
        const optional = segment.endsWith("?");
        const name = segment.slice(1, optional ? -1 : undefined);
        if (!PARAMETER_NAME.test(name)) {
          throw new Error("Invalid native route parameter name");
        }
        names.push(name);
        return optional ? `(?:${separator}([^/]+))?` : `${separator}([^/]+)`;
      }
      return `${separator}${segment.replace(REGEXP_CHARACTERS, "\\$&")}`;
    })
    .join("");
  return { expression: new RegExp(`^${expression}$`), names };
}

/** Match global/path CORS rules using the same explicit native route grammar. */
export function matchPath(pattern: string, path: string): boolean {
  if (pattern === "*" || pattern === "/*") {
    return true;
  }
  return compilePathPattern(pattern).expression.test(path);
}
