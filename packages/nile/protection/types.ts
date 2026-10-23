export interface HttpProtectionOptions {
  /** Bytes accepted before parsing. Default 10 MiB; false explicitly disables the application limit. */
  maxBodyBytes?: number | false;
  /** Supply the actual peer address from the listener, never from a request header. */
  getClientAddress?: (request: Request) => string | undefined;
  /** Only peers accepted here can contribute trusted forwarded addresses. */
  trustProxy?: (address: string) => boolean;
}

export interface ClientAddress {
  address?: string;
  peer?: string;
  source: "peer" | "forwarded" | "unknown";
}
