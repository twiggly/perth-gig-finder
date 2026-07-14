import type {
  GigStore,
  SourceAdapter,
  SourceAdapterResult,
  SourceExecutionResult,
  SourceRecord
} from "./types";
import {
  processSourceListings,
  runSourcePostProcessing
} from "./run-source/phases";
import { buildSourceExecutionResult, nowIso } from "./run-source/result";
import {
  fetchSourceListingsWithMetrics,
  MeasuredSourceFetchError,
  type SourceRunMetrics
} from "./scrape-metrics";
import { readPositiveIntegerEnv } from "./source-utils/env";
import { getErrorMessage } from "./source-utils/errors";

export interface SourceRunExecution {
  result: SourceExecutionResult;
  metrics: SourceRunMetrics;
}

export interface ExecuteSourceRunOptions {
  fetchImpl?: typeof fetch;
  fetchSlotWaitMs?: number;
}

export interface ExecuteSourceRunsOptions {
  fetchImpl?: typeof fetch;
  concurrency?: number;
  onSourceStart?: (source: SourceAdapter) => void;
  onSourceComplete?: (execution: SourceRunExecution) => void;
}

interface StartedSourceRun {
  source: SourceAdapter;
  sourceRecord: SourceRecord;
  runId: string;
  startedAt: string;
  metrics: SourceRunMetrics;
}

interface FetchedSourceRun extends StartedSourceRun {
  listings: SourceAdapterResult | null;
  fetchError: unknown;
  fetchedAtMs: number;
}

function createSourceRunMetrics(
  source: string,
  fetchSlotWaitMs: number
): SourceRunMetrics {
  return {
    source,
    queueMs: 0,
    fetchSlotWaitMs,
    fetchMs: 0,
    persistenceMs: 0,
    postProcessingMs: 0,
    counters: {},
    requests: {
      requestCount: 0,
      errorCount: 0,
      hosts: {}
    }
  };
}

export function getSourceFetchConcurrency(
  env: NodeJS.ProcessEnv = process.env
): number {
  return readPositiveIntegerEnv("SCRAPER_SOURCE_FETCH_CONCURRENCY", 2, env);
}

async function startSourceRun(input: {
  store: GigStore;
  source: SourceAdapter;
  fetchSlotWaitMs: number;
}): Promise<StartedSourceRun> {
  const sourceRecord = await input.store.ensureSource({
    slug: input.source.slug,
    name: input.source.name,
    baseUrl: input.source.baseUrl,
    priority: input.source.priority,
    isPublicListingSource: input.source.isPublicListingSource
  });
  const startedAt = nowIso();
  const runId = await input.store.startScrapeRun(sourceRecord.id, startedAt);

  return {
    source: input.source,
    sourceRecord,
    runId,
    startedAt,
    metrics: createSourceRunMetrics(input.source.slug, input.fetchSlotWaitMs)
  };
}

async function fetchStartedSourceRun(
  started: StartedSourceRun,
  fetchImpl: typeof fetch,
  store: GigStore
): Promise<FetchedSourceRun> {
  try {
    const measuredFetch = await fetchSourceListingsWithMetrics({
      source: started.source,
      fetchImpl,
      context: {
        loadSourceGigPayloads: (externalIds) =>
          store.loadSourceGigPayloads(started.sourceRecord.id, externalIds)
      }
    });
    started.metrics.fetchMs = measuredFetch.fetchMs;
    started.metrics.requests = measuredFetch.requests;
    started.metrics.counters = measuredFetch.counters;

    return {
      ...started,
      listings: measuredFetch.result,
      fetchError: null,
      fetchedAtMs: Date.now()
    };
  } catch (error) {
    if (error instanceof MeasuredSourceFetchError) {
      started.metrics.fetchMs = error.fetchMs;
      started.metrics.requests = error.requests;
      started.metrics.counters = error.counters;
    }

    return {
      ...started,
      listings: null,
      fetchedAtMs: Date.now(),
      fetchError:
        error instanceof MeasuredSourceFetchError ? error.originalError : error
    };
  }
}

async function finishFailedSourceRun(input: {
  store: GigStore;
  fetched: FetchedSourceRun;
  error: unknown;
}): Promise<SourceRunExecution> {
  const finishedAt = nowIso();
  const errorMessage = getErrorMessage(input.error, "Unexpected scraper failure");

  await input.store.finishScrapeRun(input.fetched.runId, {
    status: "failed",
    discoveredCount: 0,
    insertedCount: 0,
    updatedCount: 0,
    failedCount: 0,
    errorMessage,
    finishedAt
  });

  return {
    result: {
      sourceSlug: input.fetched.source.slug,
      sourceId: input.fetched.sourceRecord.id,
      runId: input.fetched.runId,
      status: "failed",
      discoveredCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      errorMessage,
      startedAt: input.fetched.startedAt,
      finishedAt
    },
    metrics: input.fetched.metrics
  };
}

async function persistFetchedSourceRun(
  store: GigStore,
  fetched: FetchedSourceRun
): Promise<SourceRunExecution> {
  fetched.metrics.queueMs = Math.max(0, Date.now() - fetched.fetchedAtMs);

  if (!fetched.listings) {
    return finishFailedSourceRun({
      store,
      fetched,
      error: fetched.fetchError
    });
  }

  try {
    const { gigs, failedCount: parseFailures } = fetched.listings;
    const persistenceStartedAtMs = Date.now();
    let state: Awaited<ReturnType<typeof processSourceListings>>;

    try {
      await store.preloadSourceRunState({
        sourceId: fetched.sourceRecord.id,
        gigs,
        now: nowIso()
      });
      state = await processSourceListings({
        store,
        source: fetched.sourceRecord,
        gigs,
        parseFailures
      });
    } finally {
      fetched.metrics.persistenceMs = Date.now() - persistenceStartedAtMs;
    }

    const postProcessingStartedAtMs = Date.now();
    await runSourcePostProcessing({
      store,
      sourceId: fetched.sourceRecord.id,
      gigCount: gigs.length,
      state
    }).finally(() => {
      fetched.metrics.postProcessingMs = Date.now() - postProcessingStartedAtMs;
    });

    if (parseFailures > 0) {
      state.errors.push(
        `${parseFailures} listing(s) could not be normalized from the source feed`
      );
    }

    const errorMessage =
      state.errors.length > 0 ? state.errors.slice(0, 3).join(" | ") : null;
    const result = buildSourceExecutionResult({
      sourceSlug: fetched.source.slug,
      sourceId: fetched.sourceRecord.id,
      runId: fetched.runId,
      startedAt: fetched.startedAt,
      insertedCount: state.insertedCount,
      updatedCount: state.updatedCount,
      failedCount: state.failedCount,
      hadPostProcessingError: state.hadPostProcessingError,
      errorMessage
    });

    await store.finishScrapeRun(fetched.runId, {
      status: result.status,
      discoveredCount: result.discoveredCount,
      insertedCount: state.insertedCount,
      updatedCount: state.updatedCount,
      failedCount: state.failedCount,
      errorMessage,
      finishedAt: result.finishedAt
    });

    return { result, metrics: fetched.metrics };
  } catch (error) {
    return finishFailedSourceRun({ store, fetched, error });
  }
}

export async function executeSourceRun(
  store: GigStore,
  source: SourceAdapter,
  fetchImpl: typeof fetch = fetch
): Promise<SourceExecutionResult> {
  return (await executeSourceRunWithMetrics(store, source, { fetchImpl })).result;
}

export async function executeSourceRunWithMetrics(
  store: GigStore,
  source: SourceAdapter,
  options: ExecuteSourceRunOptions = {}
): Promise<SourceRunExecution> {
  const started = await startSourceRun({
    store,
    source,
    fetchSlotWaitMs: options.fetchSlotWaitMs ?? 0
  });
  const fetched = await fetchStartedSourceRun(
    started,
    options.fetchImpl ?? fetch,
    store
  );
  return persistFetchedSourceRun(store, fetched);
}

export async function executeSourceRunsPipelined(
  store: GigStore,
  sources: readonly SourceAdapter[],
  options: ExecuteSourceRunsOptions = {}
): Promise<SourceRunExecution[]> {
  const concurrency = options.concurrency ?? getSourceFetchConcurrency();

  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Source fetch concurrency must be a positive integer");
  }

  const schedulerStartedAtMs = Date.now();
  const pendingFetches = new Map<number, Promise<FetchedSourceRun>>();
  const executions: SourceRunExecution[] = [];
  let nextSourceIndex = 0;

  const fillFetchQueue = (): void => {
    while (
      nextSourceIndex < sources.length &&
      pendingFetches.size < concurrency
    ) {
      const sourceIndex = nextSourceIndex;
      const source = sources[sourceIndex]!;
      nextSourceIndex += 1;
      options.onSourceStart?.(source);
      pendingFetches.set(
        sourceIndex,
        startSourceRun({
          store,
          source,
          fetchSlotWaitMs: Date.now() - schedulerStartedAtMs
        }).then((started) =>
          fetchStartedSourceRun(started, options.fetchImpl ?? fetch, store)
        )
      );
    }
  };

  fillFetchQueue();

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    const pendingFetch = pendingFetches.get(sourceIndex);

    if (!pendingFetch) {
      throw new Error(`Source fetch was not scheduled at index ${sourceIndex}`);
    }

    const fetched = await pendingFetch;
    pendingFetches.delete(sourceIndex);
    fillFetchQueue();
    const execution = await persistFetchedSourceRun(store, fetched);
    executions.push(execution);
    options.onSourceComplete?.(execution);
  }

  return executions;
}
