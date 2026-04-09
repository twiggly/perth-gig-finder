import http from "node:http";
import { networkInterfaces } from "node:os";
import { spawn } from "node:child_process";

const upstreamHost = "127.0.0.1";
const upstreamPort = 3103;
const publicHost = "0.0.0.0";
const publicPort = 3003;
const previewRevision = Date.now().toString();
const previewAssetPrefix = `/preview-assets-${previewRevision}`;

function getPreviewUrls() {
  const interfaces = networkInterfaces();
  const lanUrls = [];
  const ignoredPrefixes = ["bridge", "docker", "lo", "utun", "veth"];

  for (const [name, entries] of Object.entries(interfaces)) {
    if (ignoredPrefixes.some((prefix) => name.startsWith(prefix))) {
      continue;
    }

    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }

      lanUrls.push(`http://${entry.address}:${publicPort}`);
    }
  }

  return {
    lanUrls: [...new Set(lanUrls)].sort(),
    localUrl: `http://127.0.0.1:${publicPort}`
  };
}

function logPreviewUrls() {
  const { lanUrls, localUrl } = getPreviewUrls();

  console.log("");
  console.log("Preview server is ready:");
  console.log(`- Local: ${localUrl}`);

  for (const lanUrl of lanUrls) {
    console.log(`- LAN:   ${lanUrl}`);
  }

  console.log(`- Assets: ${previewAssetPrefix}`);
  console.log("");
}

function startProxy() {
  const server = http.createServer((request, response) => {
    const upstreamPath = (() => {
      if (!request.url) {
        return request.url;
      }

      const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

      if (url.pathname.startsWith(`${previewAssetPrefix}/_next/`)) {
        url.pathname = url.pathname.slice(previewAssetPrefix.length);
      }

      return `${url.pathname}${url.search}`;
    })();

    const upstream = http.request(
      {
        headers: request.headers,
        host: upstreamHost,
        method: request.method,
        path: upstreamPath,
        port: upstreamPort
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 500, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      }
    );

    upstream.on("error", (error) => {
      response.statusCode = 502;
      response.end(`Local preview upstream error: ${error.message}`);
    });

    request.pipe(upstream);
  });

  server.listen(publicPort, publicHost, () => {
    console.log(
      `Preview proxy listening on http://${publicHost}:${publicPort} -> http://${upstreamHost}:${upstreamPort}`
    );
    logPreviewUrls();
  });

  return server;
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      ...options
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

async function main() {
  await run("pnpm", ["--filter", "@perth-gig-finder/web", "build"], {
    env: {
      ...process.env,
      PERTH_GIG_FINDER_PREVIEW_ASSET_PREFIX: previewAssetPrefix
    }
  });

  const upstream = spawn(
    "pnpm",
    [
      "--filter",
      "@perth-gig-finder/web",
      "exec",
      "next",
      "start",
      "--hostname",
      upstreamHost,
      "--port",
      String(upstreamPort)
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PERTH_GIG_FINDER_PREVIEW_ASSET_PREFIX: previewAssetPrefix
      },
      stdio: ["inherit", "pipe", "pipe"]
    }
  );

  let proxyServer;
  const shutdown = () => {
    proxyServer?.close();
    upstream.kill("SIGTERM");
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  upstream.on("exit", (code) => {
    proxyServer?.close();
    process.exit(code ?? 0);
  });
  upstream.on("error", (error) => {
    console.error(error);
    process.exit(1);
  });

  upstream.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);

    if (!proxyServer && text.includes("Ready")) {
      proxyServer = startProxy();
    }
  });

  upstream.stderr.on("data", (chunk) => {
    process.stderr.write(chunk.toString());
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
