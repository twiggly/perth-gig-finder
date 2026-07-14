import type { SourceExecutionResult } from "../types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function buildSourceExecutionResult(input: {
  sourceSlug: string;
  sourceId: string;
  runId: string;
  startedAt: string;
  insertedCount: number;
  updatedCount: number;
  failedCount: number;
  hadPostProcessingError: boolean;
  errorMessage: string | null;
}): SourceExecutionResult {
  const finishedAt = nowIso();
  const processedCount = input.insertedCount + input.updatedCount;
  const hasErrors = input.failedCount > 0 || input.hadPostProcessingError;
  const status =
    processedCount === 0 && hasErrors
      ? "failed"
      : hasErrors
        ? "partial"
        : "success";

  return {
    sourceSlug: input.sourceSlug,
    sourceId: input.sourceId,
    runId: input.runId,
    status,
    discoveredCount: processedCount + input.failedCount,
    insertedCount: input.insertedCount,
    updatedCount: input.updatedCount,
    failedCount: input.failedCount,
    errorMessage: input.errorMessage,
    startedAt: input.startedAt,
    finishedAt
  };
}
