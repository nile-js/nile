import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createBunHttpClient } from "./bun-http-client.mjs";
import { createExchange, safeTry } from "./codecs.mjs";
import { runTrial } from "./trial.mjs";

const isBun = Boolean(process.versions.bun);
const framework = {
  name: "fixture",
  codec: "json",
  pathTemplate: "/actions/action-{action}",
};

/** Open an ephemeral correctness-test server and close every owned socket on completion. */
async function withServer({ handler, check }) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const target = {
    ...framework,
    url: `http://127.0.0.1:${server.address().port}`,
  };
  return check(target).finally(async () => {
    const closed = new Promise((resolve) => server.close(resolve));
    server.closeAllConnections();
    await closed;
  });
}

/** Return the same operation identity and business result as the fixture workload. */
async function respond(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const payload = safeTry(() => JSON.parse(Buffer.concat(chunks).toString()));
  if (!payload.status) {
    response.writeHead(400).end("{}");
    return;
  }
  const action = Number(request.url.split("action-")[1]);
  response.setHeader("content-type", "application/json");
  response.end(
    JSON.stringify({ ...payload.data, value: payload.data.value + 1, action })
  );
}

/** Build one standard exchange without changing the transport's body or codec. */
function exchange(framework, sequence = 0) {
  return createExchange({ framework, sequence, actionCount: 300 });
}

test(
  "Bun client fails immediately under another runtime",
  { skip: isBun },
  () => {
    assert.throws(
      () => createBunHttpClient({ concurrency: 1, timeoutSeconds: 1 }),
      /requires Bun/
    );
  }
);

test(
  "Bun client rejects unsupported concurrency and nonfinite deadlines",
  { skip: !isBun },
  () => {
    for (const concurrency of [0, -1, 1.5, 257, 300]) {
      assert.throws(() =>
        createBunHttpClient({ concurrency, timeoutSeconds: 1 })
      );
    }
    for (const timeoutSeconds of [0, Infinity, NaN]) {
      assert.throws(() =>
        createBunHttpClient({ concurrency: 1, timeoutSeconds })
      );
    }
  }
);

test(
  "native fetch preserves HTTP/1.1 JSON bodies and reuses keepalive sockets",
  { skip: !isBun },
  async () => {
    const bodies = [];
    const sockets = new Set();
    await withServer({
      handler: async (request, response) => {
        assert.equal(request.httpVersion, "1.1");
        assert.equal(request.headers["content-type"], "application/json");
        assert.equal(request.headers["accept-encoding"], "identity");
        sockets.add(request.socket);
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        bodies.push(Buffer.concat(chunks).toString());
        response.end(
          JSON.stringify({
            id: bodies.length - 1,
            value: bodies.length,
            action: bodies.length - 1,
          })
        );
      },
      check: async (target) => {
        const client = createBunHttpClient({
          concurrency: 1,
          timeoutSeconds: 1,
        });
        for (const sequence of [0, 1]) {
          const request = exchange(target, sequence);
          const result = await client.request(request);
          assert.equal(result.status, true);
          assert.deepEqual(JSON.parse(result.body), request.expected);
          assert.equal(result.responseBytes, Buffer.byteLength(result.body));
          assert.equal(bodies[sequence], request.body);
        }
        client.close();
      },
    });
    assert.equal(sockets.size, 1);
  }
);

for (const framed of [false, true])
  test(
    `deadline covers a stalled ${framed ? "framed" : "chunked"} body after headers arrive`,
    { skip: !isBun },
    async () => {
      await withServer({
        handler: (_request, response) => {
          response.writeHead(200, {
            "content-type": "application/json",
            ...(framed ? { "content-length": "100" } : {}),
          });
          response.write('{"id":');
        },
        check: async (target) => {
          const client = createBunHttpClient({
            concurrency: 1,
            timeoutSeconds: 0.05,
          });
          const result = await client.request(exchange(target));
          assert.equal(result.status, false);
          assert.equal(result.kind, "timeout");
          if (!framed) assert.ok(result.responseBytes > 0);
          client.close();
        },
      });
    }
  );

test(
  "streamed responses over the byte limit are aborted and reported",
  { skip: !isBun },
  async () => {
    await withServer({
      handler: (_request, response) => {
        response.writeHead(200);
        response.write("x".repeat(65536));
        response.end("x");
      },
      check: async (target) => {
        const client = createBunHttpClient({
          concurrency: 1,
          timeoutSeconds: 1,
        });
        const result = await client.request(exchange(target));
        assert.equal(result.status, false);
        assert.equal(result.kind, "oversized");
        assert.ok(result.responseBytes > 65536);
        client.close();
      },
    });
  }
);

test(
  "exact byte limit is accepted and fully consumed",
  { skip: !isBun },
  async () => {
    await withServer({
      handler: (_request, response) => response.end("x".repeat(65536)),
      check: async (target) => {
        const client = createBunHttpClient({
          concurrency: 1,
          timeoutSeconds: 1,
        });
        const result = await client.request(exchange(target));
        assert.equal(result.status, true);
        assert.equal(result.responseBytes, 65536);
        assert.equal(Buffer.byteLength(result.body), 65536);
        client.close();
      },
    });
  }
);

test(
  "native transport retains exact concurrent request budgets and validates every response",
  { skip: !isBun },
  async () => {
    let received = 0;
    await withServer({
      handler: async (request, response) => {
        received += 1;
        await respond(request, response);
      },
      check: async (target) => {
        const client = createBunHttpClient({
          concurrency: 30,
          timeoutSeconds: 2,
        });
        const trial = await runTrial({
          framework: target,
          workload: { actionCount: 300 },
          concurrency: 30,
          requestCount: 307,
          request: client.request,
        });
        assert.equal(received, 307);
        assert.equal(trial.counters.requests, 307);
        assert.equal(trial.counters.successful, 307);
        assert.equal(trial.latency.count, 307);
        assert.equal(trial.actionCoverage, 300);
        assert.equal(trial.valid, true);
        client.close();
      },
    });
  }
);

test(
  "wrong payload, non200 and redirects remain failures without retries",
  { skip: !isBun },
  async () => {
    let received = 0;
    await withServer({
      handler: (_request, response) => {
        received += 1;
        if (received === 1) response.writeHead(200).end("{}");
        else if (received === 2) response.writeHead(503).end("{}");
        else response.writeHead(302, { location: "/redirected" }).end("{}");
      },
      check: async (target) => {
        const client = createBunHttpClient({
          concurrency: 1,
          timeoutSeconds: 1,
        });
        const trial = await runTrial({
          framework: target,
          workload: { actionCount: 300 },
          concurrency: 1,
          requestCount: 3,
          request: client.request,
        });
        assert.equal(received, 3);
        assert.equal(trial.counters.failed, 3);
        assert.equal(trial.counters.non200, 2);
        assert.equal(trial.counters.mismatches, 3);
        assert.equal(trial.valid, false);
        client.close();
      },
    });
  }
);

test(
  "close aborts active body reads and refuses new work",
  { skip: !isBun },
  async () => {
    const started = Promise.withResolvers();
    await withServer({
      handler: (_request, response) => {
        response.writeHead(200);
        response.write("partial");
        started.resolve();
      },
      check: async (target) => {
        const client = createBunHttpClient({
          concurrency: 1,
          timeoutSeconds: 5,
        });
        const pending = client.request(exchange(target));
        await started.promise;
        client.close();
        assert.equal((await pending).status, false);
        const refused = await client.request(exchange(target));
        assert.equal(refused.status, false);
        assert.equal(refused.responseBytes, 0);
      },
    });
  }
);

test(
  "framed body truncation is a transport failure",
  { skip: !isBun },
  async () => {
    await withServer({
      handler: (_request, response) => {
        response.writeHead(200, {
          "content-length": "100",
          connection: "close",
        });
        response.end("{}");
      },
      check: async (target) => {
        const client = createBunHttpClient({
          concurrency: 1,
          timeoutSeconds: 1,
        });
        const result = await client.request(exchange(target));
        assert.equal(result.status, false);
        assert.equal(result.kind, "network");
        client.close();
      },
    });
  }
);

test(
  "a too-short declared frame cannot conceal a payload mismatch",
  { skip: !isBun },
  async () => {
    await withServer({
      handler: (_request, response) => {
        response.writeHead(200, { "content-length": "2", connection: "close" });
        response.end('{"id":0,"value":1,"action":0}');
      },
      check: async (target) => {
        const client = createBunHttpClient({
          concurrency: 1,
          timeoutSeconds: 1,
        });
        const trial = await runTrial({
          framework: target,
          workload: { actionCount: 300 },
          concurrency: 1,
          requestCount: 1,
          request: client.request,
        });
        assert.equal(trial.counters.requests, 1);
        assert.equal(trial.counters.failed, 1);
        assert.equal(trial.counters.mismatches, 1);
        assert.equal(trial.valid, false);
        client.close();
      },
    });
  }
);

test(
  "oversized declared frames are rejected before native buffering",
  { skip: !isBun },
  async () => {
    await withServer({
      handler: (_request, response) => {
        response.writeHead(200, { "content-length": "65537" });
        response.write("x");
      },
      check: async (target) => {
        const client = createBunHttpClient({
          concurrency: 1,
          timeoutSeconds: 1,
        });
        const result = await client.request(exchange(target));
        assert.equal(result.status, false);
        assert.equal(result.kind, "oversized");
        assert.equal(result.responseBytes, 0);
        client.close();
      },
    });
  }
);
