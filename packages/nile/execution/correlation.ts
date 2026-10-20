const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/** Bound untrusted correlation values before returning them in headers or logs. */
export function createRequestId(value?: string | null): string {
  return value && SAFE_ID.test(value) ? value : crypto.randomUUID();
}
