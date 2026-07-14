import "dotenv/config";

import { pathToFileURL } from "node:url";

import { executeSourceRunsPipelined } from "./run-source";
import { formatSourceMetricsLogLine } from "./scrape-metrics";
import { resolveSourcesToRun } from "./source-selection";
import { readBooleanEnv } from "./source-utils/env";
import { SupabaseGigStore } from "./supabase-store";
import type { SourceExecutionResult } from "./types";

export interface SourceRunSummary {
  source: string;
  status: SourceExecutionResult["status"];
  discoveredCount: number;
  insertedCount: number;
  updatedCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  errorMessage: string | null;
}

function calculateElapsedMs(startedAt: string, finishedAt: string): number {
  const elapsedMs = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : 0;
}

export function buildSourceRunSummary(
  result: SourceExecutionResult
): SourceRunSummary {
  return {
    source: result.sourceSlug,
    status: result.status,
    discoveredCount: result.discoveredCount,
    insertedCount: result.insertedCount,
    updatedCount: result.updatedCount,
    failedCount: result.failedCount,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    elapsedMs: calculateElapsedMs(result.startedAt, result.finishedAt),
    errorMessage: result.errorMessage
  };
}

export function formatSourceRunLogLine(summary: SourceRunSummary): string {
  const baseMessage =
    `[scrape] ${summary.source} completed in ${summary.elapsedMs}ms ` +
    `(status=${summary.status}, discovered=${summary.discoveredCount}, ` +
    `inserted=${summary.insertedCount}, updated=${summary.updatedCount}, ` +
    `failed=${summary.failedCount})`;

  return summary.errorMessage
    ? `${baseMessage} error=${summary.errorMessage}`
    : baseMessage;
}

export async function main(): Promise<void> {
  const store = new SupabaseGigStore();
  const selectedSources = resolveSourcesToRun();
  const scrapeStartedAtMs = Date.now();
  const shouldLogMetrics = readBooleanEnv("SCRAPER_PROFILE", false);

  await store.ensureImageBucket();
  console.error(`[scrape] starting ${selectedSources.length} source(s)`);

  const executions = await executeSourceRunsPipelined(store, selectedSources, {
    onSourceStart(source) {
      console.error(`[scrape] starting ${source.slug}`);
    },
    onSourceComplete(execution) {
      console.error(formatSourceRunLogLine(buildSourceRunSummary(execution.result)));

      if (shouldLogMetrics) {
        console.error(formatSourceMetricsLogLine(execution.metrics));
      }
    }
  });
  const results: SourceExecutionResult[] = executions.map(
    (execution) => execution.result
  );

  console.error(
    `[scrape] all sources completed in ${Date.now() - scrapeStartedAtMs}ms`
  );

  console.log(
    JSON.stringify(
      results.map(buildSourceRunSummary),
      null,
      2
    )
  );

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
