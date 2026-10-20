export interface ProjectOptions {
  /** Application root; monorepos should supply the backend package directory. */
  root?: string;
  structure?: "warn" | "error" | false;
}
export interface StructureIssue {
  path: string;
  message: string;
}
export interface StructureReport {
  skipped: boolean;
  issues: StructureIssue[];
}
