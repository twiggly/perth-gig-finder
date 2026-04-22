import { describe, expect, it } from "vitest";

import {
  buildSourceRunSummary,
  formatSourceRunLogLine
} from "../index";
import type { SourceExecutionResult } from "../types";

function createSourceResult(
  overrides: Partial<SourceExecutionResult> = {}
): SourceExecutionResult {
  return {
    sourceSlug: "oztix-wa",
    sourceId: "source-1",
    runId: "run-1",
    status: "success",
    discoveredCount: 12,
    insertedCount: 4,
    updatedCount: 8,
    failedCount: 0,
    errorMessage: null,
    startedAt: "2026-04-22T08:00:00.000Z",
    finishedAt: "2026-04-22T08:00:05.250Z",
    ...overrides
  };
}

describe("buildSourceRunSummary", () => {
  it("calculates elapsed time from the run timestamps", () => {
    expect(buildSourceRunSummary(createSourceResult())).toMatchObject({
      source: "oztix-wa",
      elapsedMs: 5250
    });
  });

  it("falls back to zero when the timestamps do not produce a valid duration", () => {
    expect(
      buildSourceRunSummary(
        createSourceResult({
          startedAt: "not-a-date",
          finishedAt: "also-not-a-date"
        })
      ).elapsedMs
    ).toBe(0);
  });
});

describe("formatSourceRunLogLine", () => {
  it("formats a concise per-source timing log line", () => {
    const summary = buildSourceRunSummary(createSourceResult());

    expect(formatSourceRunLogLine(summary)).toBe(
      "[scrape] oztix-wa completed in 5250ms (status=success, discovered=12, inserted=4, updated=8, failed=0)"
    );
  });

  it("appends the error message for partial or failed runs", () => {
    const summary = buildSourceRunSummary(
      createSourceResult({
        status: "partial",
        failedCount: 2,
        errorMessage: "Unable to sync canonical artists"
      })
    );

    expect(formatSourceRunLogLine(summary)).toBe(
      "[scrape] oztix-wa completed in 5250ms (status=partial, discovered=12, inserted=4, updated=8, failed=2) error=Unable to sync canonical artists"
    );
  });
});
