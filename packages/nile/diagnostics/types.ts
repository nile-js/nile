export interface ErrorCause {
  name: string;
  message?: string;
  code?: string;
  constraint?: string;
  table?: string;
  routine?: string;
}
export interface ErrorDiagnostic {
  /** Deepest observed cause first, so the driver's reason leads the report. */
  causes: ErrorCause[];
  truncated: boolean;
  circular: boolean;
}
export interface DescribeErrorOptions {
  maxDepth?: number;
  maxFieldLength?: number;
  /** Raw messages may contain private data. Automatic DB logging keeps this disabled. */
  includeMessages?: boolean;
}
