import http from "node:http";
import https from "node:https";

/** Keep sockets alive within a trial; destroy them explicitly between trials. */
export function createHttpClient({
  concurrency,
  timeoutSeconds,
  maxResponseBytes = 65536,
}) {
  const agents = {
    "http:": new http.Agent({
      keepAlive: true,
      maxSockets: concurrency,
      maxFreeSockets: concurrency,
    }),
    "https:": new https.Agent({
      keepAlive: true,
      maxSockets: concurrency,
      maxFreeSockets: concurrency,
    }),
  };
  return {
    request(exchange) {
      return new Promise((resolve) => {
        let finished = false;
        let timedOut = false;
        let responseBytes = 0;
        let timer;
        const finish = (result) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          resolve({ responseBytes, ...result });
        };
        const transport = exchange.url.protocol === "https:" ? https : http;
        const request = transport.request(exchange.url, {
          method: "POST",
          agent: agents[exchange.url.protocol],
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(exchange.body),
            accept: "application/json",
          },
        });
        timer = setTimeout(() => {
          timedOut = true;
          request.destroy(Error("Request deadline exceeded"));
        }, timeoutSeconds * 1000);
        request.on("response", (response) => {
          const chunks = [];
          response.on("data", (chunk) => {
            responseBytes += chunk.length;
            if (responseBytes > maxResponseBytes) {
              finish({
                status: false,
                kind: "oversized",
                message: "Response exceeds limit",
              });
              response.destroy();
              request.destroy();
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () =>
            finish({
              status: true,
              statusCode: response.statusCode,
              body: Buffer.concat(chunks).toString("utf8"),
            })
          );
          response.on("error", (error) =>
            finish({
              status: false,
              kind: timedOut ? "timeout" : "network",
              message: error.message,
            })
          );
          response.on("aborted", () =>
            finish({
              status: false,
              kind: timedOut ? "timeout" : "network",
              message: "Response aborted",
            })
          );
        });
        request.on("error", (error) =>
          finish({
            status: false,
            kind: timedOut ? "timeout" : "network",
            message: error.message,
          })
        );
        request.end(exchange.body);
      });
    },
    close() {
      Object.values(agents).forEach((agent) => agent.destroy());
    },
  };
}
