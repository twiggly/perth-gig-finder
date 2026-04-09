import "dotenv/config";

import { pathToFileURL } from "node:url";

import { SupabaseGigStore } from "./supabase-store";
import type { GigStore } from "./types";

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
  } = {}
): Promise<MirrorImagesResult> {
  await store.ensureImageBucket();
  const sourceGigs = await store.listSourceGigsNeedingImageMirror(options.force);

  let mirroredCount = 0;
  let failedCount = 0;

  for (const sourceGig of sourceGigs) {
    const result = await store.mirrorSourceGigImage(sourceGig, fetchImpl);

    if (result.status === "ready") {
      mirroredCount += 1;
    } else if (result.status === "failed") {
      failedCount += 1;
    }
  }

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
