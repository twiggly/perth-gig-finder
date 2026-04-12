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

class UserFacingError extends Error {
  constructor(message, guidance = []) {
    super(message);
    this.guidance = guidance;
  }
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
    throw new UserFacingError(
      "Docker is unavailable and Colima is not installed.",
      [
        "Install Colima or start Docker Desktop manually.",
        "Then rerun `pnpm supabase:start`."
      ]
    );
  }

  console.log("Docker is not available. Starting Colima...");
  try {
    await run("colima", ["start"]);
  } catch {
    throw new UserFacingError(
      "Colima could not be started automatically.",
      [
        "Start Colima manually with `colima start`.",
        "Then rerun `pnpm supabase:start`."
      ]
    );
  }

  if (!(await succeeds("docker", ["info"]))) {
    throw new UserFacingError(
      "Docker is still unavailable after attempting to start Colima.",
      [
        "Check `colima status` or Docker Desktop.",
        "Then rerun `pnpm supabase:start`."
      ]
    );
  }
}

async function ensureLocalSupabase() {
  await ensureDockerRuntime();

  try {
    await run("supabase", ["start", "-x", disabledServices.join(",")]);
  } catch {
    throw new UserFacingError("Local Supabase could not be started.", [
      "Check Docker and Colima health.",
      "Then rerun `pnpm supabase:start`."
    ]);
  }
}

try {
  await ensureLocalSupabase();
} catch (error) {
  if (error instanceof UserFacingError) {
    console.error(error.message);

    if (error.guidance.length > 0) {
      console.error("");
      for (const step of error.guidance) {
        console.error(step);
      }
    }

    process.exit(1);
  }

  console.error(error);
  process.exit(1);
}
