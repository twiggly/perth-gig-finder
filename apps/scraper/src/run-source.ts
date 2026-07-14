import type { GigStore, SourceAdapter, SourceExecutionResult } from "./types";
import {
  processSourceListings,
  runSourcePostProcessing
} from "./run-source/phases";
import { buildSourceExecutionResult, nowIso } from "./run-source/result";
import { getErrorMessage } from "./source-utils/errors";

export async function executeSourceRun(
  store: GigStore,
  source: SourceAdapter,
  fetchImpl: typeof fetch = fetch
): Promise<SourceExecutionResult> {
  const sourceRecord = await store.ensureSource({
    slug: source.slug,
    name: source.name,
    baseUrl: source.baseUrl,
    priority: source.priority,
    isPublicListingSource: source.isPublicListingSource
  });

  const startedAt = nowIso();
  const runId = await store.startScrapeRun(sourceRecord.id, startedAt);

  try {
    const { gigs, failedCount: parseFailures } = await source.fetchListings(fetchImpl);
    const state = await processSourceListings({
      store,
      source: sourceRecord,
      gigs,
      parseFailures
    });

    await runSourcePostProcessing({
      store,
      sourceId: sourceRecord.id,
      gigCount: gigs.length,
      state
    });

    if (parseFailures > 0) {
      state.errors.push(
        `${parseFailures} listing(s) could not be normalized from the source feed`
      );
    }

    const errorMessage =
      state.errors.length > 0 ? state.errors.slice(0, 3).join(" | ") : null;

    const result = buildSourceExecutionResult({
      sourceSlug: source.slug,
      sourceId: sourceRecord.id,
      runId,
      startedAt,
      insertedCount: state.insertedCount,
      updatedCount: state.updatedCount,
      failedCount: state.failedCount,
      hadPostProcessingError: state.hadPostProcessingError,
      errorMessage
    });

    await store.finishScrapeRun(runId, {
      status: result.status,
      discoveredCount: result.discoveredCount,
      insertedCount: state.insertedCount,
      updatedCount: state.updatedCount,
      failedCount: state.failedCount,
      errorMessage,
      finishedAt: result.finishedAt
    });

    return result;
  } catch (error) {
    const finishedAt = nowIso();
    const errorMessage = getErrorMessage(error, "Unexpected scraper failure");

    await store.finishScrapeRun(runId, {
      status: "failed",
      discoveredCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      errorMessage,
      finishedAt
    });

    return {
      sourceSlug: source.slug,
      sourceId: sourceRecord.id,
      runId,
      status: "failed",
      discoveredCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      errorMessage,
      startedAt,
      finishedAt
    };
  }
}
