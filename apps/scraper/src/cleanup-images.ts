import "dotenv/config";

import { pathToFileURL } from "node:url";

import { SupabaseGigStore } from "./supabase-store";

export const DEFAULT_IMAGE_CLEANUP_RETENTION_DAYS = 14;

export type ImageCleanupCandidateKind = "expired" | "orphaned";

export interface ImageCleanupObject {
  path: string;
  sizeBytes: number;
}

export interface ImageCleanupCandidate extends ImageCleanupObject {
  kind: ImageCleanupCandidateKind;
}

export interface ImageCleanupDeleteFailure {
  message: string;
  path: string;
}

export interface ImageCleanupDeleteResult {
  deletedPaths: string[];
  failures: ImageCleanupDeleteFailure[];
}

export interface ImageCleanupStore {
  clearExpiredMirroredImageReferences(paths: string[]): Promise<number>;
  deleteMirroredImageObjects(paths: string[]): Promise<ImageCleanupDeleteResult>;
  listExpiredMirroredImageReferences(cutoffIso: string): Promise<ImageCleanupObject[]>;
  listOrphanedMirroredImageObjects(): Promise<ImageCleanupObject[]>;
}

export interface ImageCleanupOptions {
  execute?: boolean;
  includeOrphans?: boolean;
  now?: Date;
  olderThanDays?: number;
}

export interface ImageCleanupResult {
  cutoffIso: string;
  deletedBytes: number;
  deletedObjectCount: number;
  dryRun: boolean;
  expiredBytes: number;
  expiredObjectCount: number;
  failedObjectCount: number;
  failures: ImageCleanupDeleteFailure[];
  orphanedBytes: number;
  orphanedObjectCount: number;
  selectedBytes: number;
  selectedObjectCount: number;
  skippedObjectCount: number;
  sourceGigRowsCleared: number;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function sumBytes(objects: ImageCleanupObject[]): number {
  return objects.reduce((total, object) => total + object.sizeBytes, 0);
}

export function calculateImageCleanupCutoff(input: {
  now?: Date;
  olderThanDays?: number;
} = {}): string {
  const olderThanDays =
    input.olderThanDays ?? DEFAULT_IMAGE_CLEANUP_RETENTION_DAYS;

  if (!Number.isFinite(olderThanDays) || olderThanDays < 0) {
    throw new Error("--older-than-days must be a non-negative number.");
  }

  return addDays(input.now ?? new Date(), -olderThanDays).toISOString();
}

export function buildImageCleanupCandidates(input: {
  expired: ImageCleanupObject[];
  orphaned: ImageCleanupObject[];
}): ImageCleanupCandidate[] {
  const candidatesByPath = new Map<string, ImageCleanupCandidate>();

  for (const object of input.expired) {
    candidatesByPath.set(object.path, {
      ...object,
      kind: "expired"
    });
  }

  for (const object of input.orphaned) {
    if (candidatesByPath.has(object.path)) {
      continue;
    }

    candidatesByPath.set(object.path, {
      ...object,
      kind: "orphaned"
    });
  }

  return [...candidatesByPath.values()].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
}

export async function cleanupGigImages(
  store: ImageCleanupStore,
  options: ImageCleanupOptions = {}
): Promise<ImageCleanupResult> {
  const cutoffIso = calculateImageCleanupCutoff(options);
  const includeOrphans = options.includeOrphans ?? true;
  const [expired, orphaned] = await Promise.all([
    store.listExpiredMirroredImageReferences(cutoffIso),
    includeOrphans ? store.listOrphanedMirroredImageObjects() : []
  ]);
  const candidates = buildImageCleanupCandidates({ expired, orphaned });
  const expiredPathSet = new Set(expired.map((object) => object.path));

  if (!options.execute) {
    return {
      cutoffIso,
      deletedBytes: 0,
      deletedObjectCount: 0,
      dryRun: true,
      expiredBytes: sumBytes(expired),
      expiredObjectCount: expired.length,
      failedObjectCount: 0,
      failures: [],
      orphanedBytes: sumBytes(orphaned),
      orphanedObjectCount: orphaned.length,
      selectedBytes: sumBytes(candidates),
      selectedObjectCount: candidates.length,
      skippedObjectCount: candidates.length,
      sourceGigRowsCleared: 0
    };
  }

  const deleteResult = await store.deleteMirroredImageObjects(
    candidates.map((candidate) => candidate.path)
  );
  const deletedPathSet = new Set(deleteResult.deletedPaths);
  const deletedCandidates = candidates.filter((candidate) =>
    deletedPathSet.has(candidate.path)
  );
  const deletedExpiredPaths = deletedCandidates
    .filter((candidate) => expiredPathSet.has(candidate.path))
    .map((candidate) => candidate.path);
  const sourceGigRowsCleared =
    deletedExpiredPaths.length > 0
      ? await store.clearExpiredMirroredImageReferences(deletedExpiredPaths)
      : 0;

  return {
    cutoffIso,
    deletedBytes: sumBytes(deletedCandidates),
    deletedObjectCount: deletedCandidates.length,
    dryRun: false,
    expiredBytes: sumBytes(expired),
    expiredObjectCount: expired.length,
    failedObjectCount: deleteResult.failures.length,
    failures: deleteResult.failures,
    orphanedBytes: sumBytes(orphaned),
    orphanedObjectCount: orphaned.length,
    selectedBytes: sumBytes(candidates),
    selectedObjectCount: candidates.length,
    skippedObjectCount: 0,
    sourceGigRowsCleared
  };
}

function printUsage(): void {
  console.log(`Usage:
  pnpm cleanup-images
  pnpm cleanup-images -- --execute
  pnpm cleanup-images -- --older-than-days 14

Options:
  --execute              Delete eligible storage objects. Defaults to dry-run.
  --older-than-days <n>  Delete referenced images for gigs older than this many days. Default: ${DEFAULT_IMAGE_CLEANUP_RETENTION_DAYS}.
  --skip-orphans         Skip orphaned object detection. Useful when full bucket listing is slow or timing out.
  --help                Show this help.
`);
}

function parseArgs(argv: string[]): ImageCleanupOptions & { help?: boolean } {
  const options: ImageCleanupOptions & { help?: boolean } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--":
        break;
      case "--execute":
        options.execute = true;
        break;
      case "--skip-orphans":
        options.includeOrphans = false;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--older-than-days": {
        const value = Number(argv[++index] ?? "");
        options.olderThanDays = value;
        break;
      }
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    return;
  }

  const store = new SupabaseGigStore();
  const result = await cleanupGigImages(store, options);

  console.log(JSON.stringify(result, null, 2));

  if (result.failedObjectCount > 0) {
    process.exitCode = 1;
  }
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
