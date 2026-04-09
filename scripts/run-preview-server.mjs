import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync
} from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const previewRoot = mkdtempSync(join(tmpdir(), "perth-gig-finder-preview-"));
const upstreamHost = "127.0.0.1";
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

function getAvailablePort(host) {
  return new Promise((resolvePromise, rejectPromise) => {
    const server = net.createServer();

    server.on("error", rejectPromise);
    server.listen(0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => rejectPromise(new Error("Could not allocate preview port.")));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          rejectPromise(error);
          return;
        }

        resolvePromise(port);
      });
    });
  });
}

function copyWorkspaceTree(sourceRelativePath) {
  const sourcePath = join(repoRoot, sourceRelativePath);
  const destinationPath = join(previewRoot, sourceRelativePath);

  cpSync(sourcePath, destinationPath, {
    dereference: false,
    filter: (src) => {
      const baseName = src.split("/").at(-1);
      return ![".next", ".next-dev", ".next-prod", "node_modules"].includes(
        baseName ?? ""
      );
    },
    force: true,
    recursive: true,
    verbatimSymlinks: true
  });
}

function preparePreviewWorkspace() {
  mkdirSync(join(previewRoot, "apps"), { recursive: true });
  mkdirSync(join(previewRoot, "packages"), { recursive: true });

  cpSync(join(repoRoot, "package.json"), join(previewRoot, "package.json"));
  cpSync(
    join(repoRoot, "pnpm-workspace.yaml"),
    join(previewRoot, "pnpm-workspace.yaml")
  );
  cpSync(join(repoRoot, "pnpm-lock.yaml"), join(previewRoot, "pnpm-lock.yaml"));
  cpSync(
    join(repoRoot, "tsconfig.base.json"),
    join(previewRoot, "tsconfig.base.json")
  );

  copyWorkspaceTree("apps/web");
  copyWorkspaceTree("packages/shared");
}

function startProxy(upstreamPort) {
  const server = http.createServer((request, response) => {
    const upstreamPath = (() => {
      if (!request.url) {
        return request.url;
      }

      const url = new URL(
        request.url,
        `http://${request.headers.host ?? "localhost"}`
      );

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
        response.writeHead(
          upstreamResponse.statusCode ?? 500,
          upstreamResponse.headers
        );
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
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      ...options
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        rejectPromise(
          new Error(`${command} ${args.join(" ")} exited with code ${code}`)
        );
      }
    });
    child.on("error", rejectPromise);
  });
}

async function main() {
  preparePreviewWorkspace();
  const upstreamPort = await getAvailablePort(upstreamHost);

  await run(
    "pnpm",
    ["install", "--offline", "--frozen-lockfile", "--ignore-scripts"],
    {
      cwd: previewRoot,
      env: process.env
    }
  );

  await run(
    "pnpm",
    ["--filter", "@perth-gig-finder/web", "exec", "next", "build"],
    {
      cwd: previewRoot,
      env: {
        ...process.env,
        PERTH_GIG_FINDER_PREVIEW_ASSET_PREFIX: previewAssetPrefix
      }
    }
  );

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
      cwd: previewRoot,
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
    rmSync(previewRoot, { force: true, recursive: true });
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
      proxyServer = startProxy(upstreamPort);
    }
  });

  upstream.stderr.on("data", (chunk) => {
    process.stderr.write(chunk.toString());
  });
}

main().catch((error) => {
  if (existsSync(previewRoot)) {
    rmSync(previewRoot, { force: true, recursive: true });
  }
  console.error(error);
  process.exit(1);
});
