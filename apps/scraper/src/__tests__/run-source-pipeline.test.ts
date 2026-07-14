import { describe, expect, it } from "vitest";

import {
  executeSourceRunsPipelined,
  getSourceFetchConcurrency
} from "../run-source";
import type { SourceAdapter, SourceAdapterResult } from "../types";
import {
  createGigForSource,
  MemoryGigStore
} from "./helpers/run-source-fixtures";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function createPipelineSource(
  slug: string,
  fetchListings: () => Promise<SourceAdapterResult>
): SourceAdapter {
  return {
    slug,
    name: slug,
    baseUrl: `https://${slug}.example.com`,
    priority: 10,
    isPublicListingSource: true,
    fetchListings
  };
}

function createSourceResult(slug: string): SourceAdapterResult {
  return {
    gigs: [
      createGigForSource({
        sourceSlug: slug,
        externalId: `${slug}-event`,
        sourceUrl: `https://${slug}.example.com/events/1`,
        title: `${slug} event`,
        status: "active",
        venueName: `${slug} venue`
      })
    ],
    failedCount: 0
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Timed out waiting for pipeline state");
}

class OrderedPipelineStore extends MemoryGigStore {
  readonly persistenceOrder: string[] = [];
  firstSourcePersistenceDelayMs = 0;

  override async preloadSourceRunState(
    input: Parameters<MemoryGigStore["preloadSourceRunState"]>[0]
  ): Promise<void> {
    this.persistenceOrder.push(input.gigs[0]?.sourceSlug ?? "unknown");

    if (
      input.gigs[0]?.sourceSlug === "source-1" &&
      this.firstSourcePersistenceDelayMs > 0
    ) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.firstSourcePersistenceDelayMs)
      );
    }

    await super.preloadSourceRunState(input);
  }
}

describe("executeSourceRunsPipelined", () => {
  it("bounds fetches while preserving source and persistence order", async () => {
    const store = new OrderedPipelineStore();
    store.firstSourcePersistenceDelayMs = 10;
    const deferredFetches = [
      createDeferred<SourceAdapterResult>(),
      createDeferred<SourceAdapterResult>(),
      createDeferred<SourceAdapterResult>()
    ];
    const fetchStarts: string[] = [];
    let activeFetches = 0;
    let maximumActiveFetches = 0;
    const sources = deferredFetches.map((deferred, index) => {
      const slug = `source-${index + 1}`;

      return createPipelineSource(slug, async () => {
        fetchStarts.push(slug);
        activeFetches += 1;
        maximumActiveFetches = Math.max(maximumActiveFetches, activeFetches);

        try {
          return await deferred.promise;
        } finally {
          activeFetches -= 1;
        }
      });
    });

    const pipeline = executeSourceRunsPipelined(store, sources, {
      concurrency: 2
    });

    await waitFor(() => fetchStarts.length === 2);
    expect(fetchStarts).toEqual(["source-1", "source-2"]);
    deferredFetches[1]!.resolve(createSourceResult("source-2"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchStarts).toEqual(["source-1", "source-2"]);

    deferredFetches[0]!.resolve(createSourceResult("source-1"));
    await waitFor(() => fetchStarts.length === 3);
    deferredFetches[2]!.resolve(createSourceResult("source-3"));

    const executions = await pipeline;

    expect(maximumActiveFetches).toBe(2);
    expect(executions.map(({ result }) => result.sourceSlug)).toEqual([
      "source-1",
      "source-2",
      "source-3"
    ]);
    expect(store.persistenceOrder).toEqual([
      "source-1",
      "source-2",
      "source-3"
    ]);
    expect(executions[1]!.metrics.queueMs).toBeGreaterThanOrEqual(5);
  });

  it("isolates fetch failures and continues later sources in order", async () => {
    const store = new OrderedPipelineStore();
    const sources = [
      createPipelineSource("source-1", async () =>
        createSourceResult("source-1")
      ),
      createPipelineSource("source-2", async () => {
        throw new Error("source unavailable");
      }),
      createPipelineSource("source-3", async () =>
        createSourceResult("source-3")
      )
    ];

    const executions = await executeSourceRunsPipelined(store, sources, {
      concurrency: 2
    });

    expect(executions.map(({ result }) => result.status)).toEqual([
      "success",
      "failed",
      "success"
    ]);
    expect(executions[1]!.result.errorMessage).toBe("source unavailable");
    expect(store.persistenceOrder).toEqual(["source-1", "source-3"]);
  });

  it("uses two fetch slots by default and supports a sequential rollback", () => {
    expect(getSourceFetchConcurrency({})).toBe(2);
    expect(
      getSourceFetchConcurrency({ SCRAPER_SOURCE_FETCH_CONCURRENCY: "1" })
    ).toBe(1);
  });
});
