import "dotenv/config";

import { pathToFileURL } from "node:url";

import { executeSourceRun } from "./run-source";
import { resolveSourcesToRun } from "./source-selection";
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
  const results: SourceExecutionResult[] = [];
  const selectedSources = resolveSourcesToRun();
  const scrapeStartedAtMs = Date.now();

  await store.ensureImageBucket();
  console.error(`[scrape] starting ${selectedSources.length} source(s)`);

  for (const source of selectedSources) {
    console.error(`[scrape] starting ${source.slug}`);
    const result = await executeSourceRun(store, source);
    const summary = buildSourceRunSummary(result);
    results.push(result);
    console.error(formatSourceRunLogLine(summary));
  }

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
