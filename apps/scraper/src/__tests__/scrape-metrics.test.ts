import { describe, expect, it, vi } from "vitest";

import { hashNormalizedListings } from "../profile-sources";
import {
  fetchSourceListingsWithMetrics,
  formatSourceMetricsLogLine,
  MeasuredSourceFetchError,
  RequestMetricsCollector
} from "../scrape-metrics";
import { readBooleanEnv, readPositiveIntegerEnv } from "../source-utils/env";
import type { SourceAdapter } from "../types";

describe("scrape performance metrics", () => {
  it("records request hosts and status groups without retaining request URLs", async () => {
    const collector = new RequestMetricsCollector();
    const measuredFetch = collector.createFetch(
      vi.fn(async () => new Response("ok", { status: 200 })) as typeof fetch
    );

    await measuredFetch("https://tickets.example.test/search?secret=do-not-log");

    const snapshot = collector.snapshot();
    expect(snapshot).toEqual({
      requestCount: 1,
      errorCount: 0,
      hosts: {
        "tickets.example.test": {
          requestCount: 1,
          errorCount: 0,
          responseHeaderMs: expect.any(Number),
          statusCounts: { "2xx": 1 }
        }
      }
    });
    expect(JSON.stringify(snapshot)).not.toContain("secret");
    expect(JSON.stringify(snapshot)).not.toContain("do-not-log");
  });

  it("retains request metrics when a source fetch fails", async () => {
    const source: SourceAdapter = {
      slug: "failing-source",
      name: "Failing source",
      baseUrl: "https://example.test",
      priority: 1,
      isPublicListingSource: true,
      async fetchListings(fetchImpl = fetch) {
        await fetchImpl("https://example.test/event/1");
        throw new Error("source failed");
      }
    };

    const failure = await fetchSourceListingsWithMetrics({
      source,
      fetchImpl: vi.fn(async () => new Response("blocked", { status: 403 })) as typeof fetch
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(MeasuredSourceFetchError);
    expect(failure).toMatchObject({
      message: "source failed",
      requests: {
        requestCount: 1,
        errorCount: 1
      }
    });
  });

  it("records numeric adapter counters without accepting URL-shaped keys", async () => {
    const source: SourceAdapter = {
      slug: "profiled-source",
      name: "Profiled source",
      baseUrl: "https://example.test",
      priority: 1,
      isPublicListingSource: true,
      async fetchListings(_fetchImpl, context) {
        context?.recordMetric?.("query_1.new_unique", 12);
        context?.recordMetric?.("https://example.test?secret=value", 99);
        return { gigs: [], failedCount: 0 };
      }
    };

    const profile = await fetchSourceListingsWithMetrics({ source });

    expect(profile.counters).toEqual({ "query_1.new_unique": 12 });
    expect(JSON.stringify(profile.counters)).not.toContain("secret");
  });

  it("formats one structured metrics line", () => {
    const line = formatSourceMetricsLogLine({
      source: "oztix-wa",
      queueMs: 0,
      fetchSlotWaitMs: 0,
      fetchMs: 10,
      persistenceMs: 20,
      postProcessingMs: 5,
      counters: {},
      requests: { requestCount: 1, errorCount: 0, hosts: {} }
    });

    expect(line.startsWith("[scrape-metrics] ")).toBe(true);
    expect(JSON.parse(line.slice("[scrape-metrics] ".length))).toMatchObject({
      source: "oztix-wa",
      fetchMs: 10
    });
  });

  it("builds stable normalized output hashes", () => {
    expect(hashNormalizedListings([{ id: "one" }])).toBe(
      hashNormalizedListings([{ id: "one" }])
    );
    expect(hashNormalizedListings([{ id: "one" }])).not.toBe(
      hashNormalizedListings([{ id: "two" }])
    );
  });
});

describe("scraper environment parsing", () => {
  it("parses boolean feature switches with a safe fallback", () => {
    expect(readBooleanEnv("FLAG", false, { FLAG: "yes" })).toBe(true);
    expect(readBooleanEnv("FLAG", true, { FLAG: "off" })).toBe(false);
    expect(readBooleanEnv("FLAG", false, { FLAG: "unexpected" })).toBe(false);
  });

  it("accepts only positive integer concurrency values", () => {
    expect(readPositiveIntegerEnv("LIMIT", 4, { LIMIT: "8" })).toBe(8);
    expect(readPositiveIntegerEnv("LIMIT", 4, { LIMIT: "0" })).toBe(4);
    expect(readPositiveIntegerEnv("LIMIT", 4, { LIMIT: "2workers" })).toBe(4);
    expect(readPositiveIntegerEnv("LIMIT", 4, { LIMIT: "many" })).toBe(4);
  });
});
