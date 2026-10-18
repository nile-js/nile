import {
  ACTION_COUNT,
  calculateResult,
  parsePayload,
} from "../shared/workload.mjs";

/** Build 300 explicit Fetch routes as a bare Bun.serve baseline without framework routing. */
export function createBunHandler({ mode, execute = calculateResult }) {
  const routes = Object.fromEntries(
    Array.from({ length: ACTION_COUNT }, (_, action) => [
      `/actions/action-${action}`,
      async (request) => {
        const parsed = parsePayload({ payload: await request.json(), mode });
        if (!parsed.status)
          return Response.json({ message: parsed.message }, { status: 400 });
        return Response.json(execute({ payload: parsed.data, action }));
      },
    ])
  );
  return (request) => {
    const route = routes[new URL(request.url).pathname];
    if (request.method !== "POST" || !route)
      return new Response(null, { status: 404 });
    return route(request);
  };
}
