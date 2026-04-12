import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const mode = process.argv[2] === "preview" ? "preview" : "dev";
const retryCommand = mode === "preview" ? "pnpm web:preview" : "pnpm web:dev";
const envFilePath = resolve("apps/web/.env.local");

function fail(message, steps = []) {
  console.error(message);

  if (steps.length > 0) {
    console.error("");
    for (const step of steps) {
      console.error(step);
    }
  }

  process.exit(1);
}

function parseEnvFile(filePath) {
  const env = {};

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    env[key] = value;
  }

  return env;
}

function commandSucceeds(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore"
  });

  return {
    error: result.error ?? null,
    success: result.status === 0
  };
}

if (!existsSync(envFilePath)) {
  fail("apps/web/.env.local is missing.", [
    "Run `pnpm supabase:keys` and copy the local values into `apps/web/.env.local`.",
    "Run `pnpm supabase:start`.",
    `Retry \`${retryCommand}\`.`
  ]);
}

const localEnv = parseEnvFile(envFilePath);

if (!localEnv.NEXT_PUBLIC_SUPABASE_URL) {
  fail("apps/web/.env.local is missing NEXT_PUBLIC_SUPABASE_URL.", [
    "Run `pnpm supabase:keys` and copy the local values into `apps/web/.env.local`.",
    `Retry \`${retryCommand}\`.`
  ]);
}

if (
  !localEnv.SUPABASE_SERVICE_ROLE_KEY &&
  !localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
) {
  fail(
    "apps/web/.env.local is missing a Supabase key for local reads.",
    [
      "Add either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY to `apps/web/.env.local`.",
      `Retry \`${retryCommand}\`.`
    ]
  );
}

const dockerInfo = commandSucceeds("docker", ["info"]);

if (!dockerInfo.success) {
  fail("Docker is not available for the local web app.", [
    dockerInfo.error?.code === "ENOENT"
      ? "Install Docker or Colima first."
      : "Start Colima or Docker Desktop manually.",
    "Run `pnpm supabase:start` once Docker is healthy.",
    `Retry \`${retryCommand}\`.`
  ]);
}

const supabaseStatus = commandSucceeds("supabase", ["status"]);

if (!supabaseStatus.success) {
  fail("Local Supabase is not ready.", [
    "Run `pnpm supabase:start` to start or repair the local stack.",
    `Retry \`${retryCommand}\`.`
  ]);
}
