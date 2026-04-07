import { execFileSync } from "node:child_process";

const DEFAULT_URL = "http://127.0.0.1:55321";
const CONTAINER_NAME = "supabase_kong_perth-gig-finder";

function extractValue(pattern, source, label) {
  const match = source.match(pattern);

  if (!match) {
    throw new Error(`Unable to find ${label} in ${CONTAINER_NAME}.`);
  }

  return match[1];
}

try {
  const inspectOutput = execFileSync("docker", ["inspect", CONTAINER_NAME], {
    encoding: "utf8"
  });

  const serviceRoleKey = extractValue(
    /headers\.apikey == '(sb_secret_[^']+)'/m,
    inspectOutput,
    "service role key"
  );
  const anonKey = extractValue(
    /headers\.apikey == '(sb_publishable_[^']+)'/m,
    inspectOutput,
    "anon key"
  );

  console.log(`NEXT_PUBLIC_SUPABASE_URL=${DEFAULT_URL}`);
  console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`);
  console.log(`SUPABASE_URL=${DEFAULT_URL}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Unknown Docker inspect failure.";
  console.error(
    `Unable to inspect ${CONTAINER_NAME}. Start Supabase first, then rerun this command.\n${message}`
  );
  process.exitCode = 1;
}
