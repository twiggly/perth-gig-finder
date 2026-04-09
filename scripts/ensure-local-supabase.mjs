import { spawn } from "node:child_process";

const disabledServices = [
  "gotrue",
  "realtime",
  "imgproxy",
  "mailpit",
  "postgres-meta",
  "studio",
  "edge-runtime",
  "logflare",
  "vector",
  "supavisor"
];

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

function succeeds(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore"
    });

    child.on("exit", (code) => {
      resolve(code === 0);
    });

    child.on("error", () => {
      resolve(false);
    });
  });
}

async function ensureDockerRuntime() {
  if (await succeeds("docker", ["info"])) {
    return;
  }

  const hasColima = await succeeds("colima", ["version"]);

  if (!hasColima) {
    throw new Error(
      "Docker is unavailable and Colima is not installed. Start Docker or install Colima first."
    );
  }

  console.log("Docker is not available. Starting Colima...");
  await run("colima", ["start"]);

  if (!(await succeeds("docker", ["info"]))) {
    throw new Error("Docker is still unavailable after starting Colima.");
  }
}

async function ensureLocalSupabase() {
  await ensureDockerRuntime();
  await run("supabase", ["start", "-x", disabledServices.join(",")]);
}

await ensureLocalSupabase();
