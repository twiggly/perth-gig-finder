import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const buildOutputs = [
  resolve("apps/web/.next"),
  resolve("apps/web/.next-dev"),
  resolve("apps/web/.next-prod")
];
const installTrees = [
  resolve("node_modules"),
  resolve("apps/scraper/node_modules"),
  resolve("apps/web/node_modules"),
  resolve("packages/shared/node_modules")
];

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

for (const outputPath of buildOutputs) {
  if (!existsSync(outputPath)) {
    continue;
  }

  rmSync(outputPath, { force: true, recursive: true });
  console.log(`Removed ${outputPath}`);
}

for (const installPath of installTrees) {
  if (!existsSync(installPath)) {
    continue;
  }

  rmSync(installPath, { force: true, recursive: true });
  console.log(`Removed ${installPath}`);
}

await run("pnpm", ["install", "--frozen-lockfile"], {
  env: {
    ...process.env,
    CI: "true"
  }
});

console.log("");
console.log("Local install repaired.");
console.log("Run `pnpm web:dev` or `pnpm web:preview` next.");
