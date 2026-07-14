import "dotenv/config";

import { pathToFileURL } from "node:url";

import { readPositiveIntegerEnv } from "./source-utils/env";
import { SupabaseGigStore } from "./supabase-store";
import type { GigStore, SourceGigImageMirrorResult } from "./types";

export interface MirrorImagesResult {
  discoveredCount: number;
  mirroredCount: number;
  failedCount: number;
}

export async function mirrorPendingSourceGigImages(
  store: GigStore,
  fetchImpl: typeof fetch = fetch,
  options: {
    force?: boolean;
    concurrency?: number;
  } = {}
): Promise<MirrorImagesResult> {
  await store.ensureImageBucket();
  const sourceGigs = await store.listSourceGigsNeedingImageMirror(options.force);

  const concurrency =
    options.concurrency ??
    readPositiveIntegerEnv("IMAGE_MIRROR_CONCURRENCY", 2);
  const results: SourceGigImageMirrorResult[] = [];

  for (let index = 0; index < sourceGigs.length; index += concurrency) {
    const batchResults = await Promise.all(
      sourceGigs
        .slice(index, index + concurrency)
        .map((sourceGig) => store.mirrorSourceGigImage(sourceGig, fetchImpl))
    );
    results.push(...batchResults);
  }
  const mirroredCount = results.filter((result) => result.status === "ready").length;
  const failedCount = results.filter((result) => result.status === "failed").length;

  return {
    discoveredCount: sourceGigs.length,
    mirroredCount,
    failedCount
  };
}

async function main(): Promise<void> {
  const store = new SupabaseGigStore();
  const result = await mirrorPendingSourceGigImages(store, fetch, {
    force: process.argv.includes("--force")
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.failedCount > 0) {
    process.exitCode = 1;
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void main();
}
