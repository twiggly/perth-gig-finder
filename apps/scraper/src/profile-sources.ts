import "dotenv/config";

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import {
  fetchSourceListingsWithMetrics,
  MeasuredSourceFetchError
} from "./scrape-metrics";
import { resolveSourcesToRun } from "./source-selection";

export function hashNormalizedListings(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function main(): Promise<void> {
  const profiles = [];

  for (const source of resolveSourcesToRun()) {
    try {
      const profile = await fetchSourceListingsWithMetrics({ source });
      profiles.push({
        source: source.slug,
        status: "success",
        gigCount: profile.result.gigs.length,
        failedCount: profile.result.failedCount,
        normalizedOutputHash: hashNormalizedListings(profile.result.gigs),
        fetchMs: profile.fetchMs,
        counters: profile.counters,
        requests: profile.requests
      });
    } catch (error) {
      profiles.push({
        source: source.slug,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unexpected profile failure",
        ...(error instanceof MeasuredSourceFetchError
          ? {
              fetchMs: error.fetchMs,
              counters: error.counters,
              requests: error.requests
            }
          : {})
      });
      process.exitCode = 1;
    }
  }

  console.log(JSON.stringify(profiles, null, 2));
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void main();
}
