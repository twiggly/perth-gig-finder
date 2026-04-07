import http from "node:http";

const targetHost = process.env.PHONE_PROXY_TARGET_HOST ?? "127.0.0.1";
const targetPort = Number.parseInt(
  process.env.PHONE_PROXY_TARGET_PORT ?? "3001",
  10
);
const listenHost = process.env.PHONE_PROXY_LISTEN_HOST ?? "0.0.0.0";
const listenPort = Number.parseInt(
  process.env.PHONE_PROXY_LISTEN_PORT ?? "3002",
  10
);

const server = http.createServer((request, response) => {
  const upstream = http.request(
    {
      headers: request.headers,
      host: targetHost,
      method: request.method,
      path: request.url,
      port: targetPort
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 500, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    }
  );

  upstream.on("error", (error) => {
    response.statusCode = 502;
    response.end(`Phone proxy upstream error: ${error.message}`);
  });

  request.pipe(upstream);
});

server.listen(listenPort, listenHost, () => {
  console.log(
    `Phone proxy listening on http://${listenHost}:${listenPort} -> http://${targetHost}:${targetPort}`
  );
});
