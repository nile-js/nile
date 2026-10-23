import { isIP } from "node:net";
import type { ClientAddress, HttpProtectionOptions } from "./types";

const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;
const UNSAFE_ADDRESS = /[\s\r\n]/;

/** Normalize listener/proxy addresses consistently, including IPv4-mapped IPv6. */
export function normalizeIp(value: string): string {
  const trimmed = value.trim();
  const mapped = MAPPED_IPV4.exec(trimmed)?.[1];
  return mapped && isIP(mapped) === 4 ? mapped : trimmed.toLowerCase();
}

/** Report address provenance while accepting forwarding only through explicitly trusted peers. */
export function resolveClientIdentity(
  request: Request,
  options: HttpProtectionOptions = {}
): ClientAddress {
  const rawPeer = options.getClientAddress?.(request) ?? "";
  const peer = normalizeIp(rawPeer);
  if (!peer || peer.length > 128 || UNSAFE_ADDRESS.test(peer)) {
    return { source: "unknown" };
  }
  const direct: ClientAddress = { address: peer, peer, source: "peer" };
  const trusted = (address: string, original: string) =>
    Boolean(
      options.trustProxy?.(address) ||
        (original !== address && options.trustProxy?.(original))
    );
  if (!trusted(peer, rawPeer)) {
    return direct;
  }
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded || forwarded.length > 4096) {
    return direct;
  }
  const chain = forwarded
    .split(",")
    .map((value) => ({ address: normalizeIp(value), original: value.trim() }));
  let address = peer;
  let original = rawPeer;
  let source: ClientAddress["source"] = "peer";
  for (let index = chain.length - 1; index >= 0; index--) {
    if (!trusted(address, original)) {
      break;
    }
    const hop = chain[index];
    const next = hop?.address;
    if (!next || next.length > 128 || UNSAFE_ADDRESS.test(next)) {
      break;
    }
    address = next;
    original = hop?.original ?? next;
    source = "forwarded";
  }
  return { address, peer, source };
}

/** Preserve the existing address-only API for request quota keys. */
export function resolveClientAddress(
  request: Request,
  options: HttpProtectionOptions
): string | undefined {
  return resolveClientIdentity(request, options).address;
}
