import "dotenv/config";

import { executeSourceRun } from "./run-source";
import { resolveSourcesToRun } from "./source-selection";
import { SupabaseGigStore } from "./supabase-store";

async function main(): Promise<void> {
  const store = new SupabaseGigStore();
  const results = [];
  const selectedSources = resolveSourcesToRun();

  for (const source of selectedSources) {
    results.push(await executeSourceRun(store, source));
  }

  console.log(
    JSON.stringify(
      results.map((result) => ({
        source: result.sourceSlug,
        status: result.status,
        discoveredCount: result.discoveredCount,
        insertedCount: result.insertedCount,
        updatedCount: result.updatedCount,
        failedCount: result.failedCount,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        errorMessage: result.errorMessage
      })),
      null,
      2
    )
  );

  if (results.some((result) => result.status === "failed")) {
    process.exitCode = 1;
  }
}

void main();
