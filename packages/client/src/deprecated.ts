const MIGRATION_MESSAGE = [
  "createNileSocketClient was removed in @nilejs/client 1.1.0.",
  "Create one client with createNileClient({ baseUrl, socket: { auth } })",
  "and use nile.socket.send, nile.socket.receive and nile.socket.close.",
  "Socket invoke is gone as well; call actions with nile.invoke over HTTP.",
  "See https://nile-js.github.io/nile/guide/features/websockets/ and the",
  "migration notes in packages/nile/docs/release-migration.md.",
].join(" ");

/**
 * Kept as a throwing stub so an upgrade fails with guidance instead of a
 * missing export.
 *
 * @deprecated Use `createNileClient({ baseUrl, socket: { auth } })` and call
 * `socket.send`, `socket.receive` and `socket.close` on the returned client.
 */
export function createNileSocketClient<Actions = unknown, Topics = unknown>(
  _config?: unknown
): never {
  throw new Error(MIGRATION_MESSAGE);
}
