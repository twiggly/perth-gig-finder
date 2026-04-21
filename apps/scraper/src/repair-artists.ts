import "dotenv/config";

import { pathToFileURL } from "node:url";

import { resolveSourcesToRun } from "./source-selection";
import { SupabaseGigStore } from "./supabase-store";

async function main(): Promise<void> {
  const store = new SupabaseGigStore();
  const results = await store.repairActiveUpcomingSourceGigArtists(resolveSourcesToRun());

  console.log(JSON.stringify(results, null, 2));

  if (results.some((result) => result.status === "failed")) {
    process.exitCode = 1;
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void main();
}
