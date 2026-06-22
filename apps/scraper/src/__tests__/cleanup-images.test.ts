import { describe, expect, it, vi } from "vitest";

import {
  buildImageCleanupCandidates,
  calculateImageCleanupCutoff,
  cleanupGigImages,
  type ImageCleanupDeleteResult,
  type ImageCleanupObject,
  type ImageCleanupStore
} from "../cleanup-images";

class FakeImageCleanupStore implements ImageCleanupStore {
  readonly clearedPaths: string[][] = [];
  readonly deletedPaths: string[][] = [];
  listOrphanedCallCount = 0;

  constructor(
    private readonly input: {
      deleteResult?: ImageCleanupDeleteResult;
      expired?: ImageCleanupObject[];
      orphaned?: ImageCleanupObject[];
    } = {}
  ) {}

  async listExpiredMirroredImageReferences(
    _cutoffIso: string
  ): Promise<ImageCleanupObject[]> {
    return this.input.expired ?? [];
  }

  async listOrphanedMirroredImageObjects(): Promise<ImageCleanupObject[]> {
    this.listOrphanedCallCount += 1;
    return this.input.orphaned ?? [];
  }

  async deleteMirroredImageObjects(
    paths: string[]
  ): Promise<ImageCleanupDeleteResult> {
    this.deletedPaths.push(paths);

    return (
      this.input.deleteResult ?? {
        deletedPaths: paths,
        failures: []
      }
    );
  }

  async clearExpiredMirroredImageReferences(paths: string[]): Promise<number> {
    this.clearedPaths.push(paths);
    return paths.length * 2;
  }
}

describe("image cleanup", () => {
  it("calculates the default 14 day cutoff", () => {
    expect(
      calculateImageCleanupCutoff({
        now: new Date("2026-06-22T12:00:00.000Z")
      })
    ).toBe("2026-06-08T12:00:00.000Z");
  });

  it("deduplicates cleanup candidates and keeps referenced expired paths", () => {
    expect(
      buildImageCleanupCandidates({
        expired: [
          {
            path: "oztix-wa/old/poster.png",
            sizeBytes: 1200
          }
        ],
        orphaned: [
          {
            path: "oztix-wa/old/poster.png",
            sizeBytes: 1200
          },
          {
            path: "moshtix-wa/orphan/poster.jpg",
            sizeBytes: 300
          }
        ]
      })
    ).toEqual([
      {
        kind: "orphaned",
        path: "moshtix-wa/orphan/poster.jpg",
        sizeBytes: 300
      },
      {
        kind: "expired",
        path: "oztix-wa/old/poster.png",
        sizeBytes: 1200
      }
    ]);
  });

  it("reports a dry run without deleting or clearing references", async () => {
    const store = new FakeImageCleanupStore({
      expired: [
        {
          path: "oztix-wa/old/poster.png",
          sizeBytes: 1200
        }
      ],
      orphaned: [
        {
          path: "moshtix-wa/orphan/poster.jpg",
          sizeBytes: 300
        }
      ]
    });

    const result = await cleanupGigImages(store, {
      now: new Date("2026-06-22T12:00:00.000Z")
    });

    expect(result).toMatchObject({
      deletedBytes: 0,
      deletedObjectCount: 0,
      dryRun: true,
      expiredBytes: 1200,
      expiredObjectCount: 1,
      orphanedBytes: 300,
      orphanedObjectCount: 1,
      selectedBytes: 1500,
      selectedObjectCount: 2,
      skippedObjectCount: 2,
      sourceGigRowsCleared: 0
    });
    expect(store.deletedPaths).toEqual([]);
    expect(store.clearedPaths).toEqual([]);
  });

  it("can skip orphaned object detection for fast referenced cleanup", async () => {
    const store = new FakeImageCleanupStore({
      expired: [
        {
          path: "oztix-wa/old/poster.png",
          sizeBytes: 0
        }
      ],
      orphaned: [
        {
          path: "moshtix-wa/orphan/poster.jpg",
          sizeBytes: 300
        }
      ]
    });

    const result = await cleanupGigImages(store, {
      includeOrphans: false,
      now: new Date("2026-06-22T12:00:00.000Z")
    });

    expect(store.listOrphanedCallCount).toBe(0);
    expect(result).toMatchObject({
      expiredObjectCount: 1,
      orphanedObjectCount: 0,
      selectedObjectCount: 1
    });
  });

  it("deletes selected objects and clears only successfully deleted expired paths", async () => {
    const store = new FakeImageCleanupStore({
      deleteResult: {
        deletedPaths: ["moshtix-wa/orphan/poster.jpg", "oztix-wa/old/poster.png"],
        failures: [
          {
            message: "delete failed",
            path: "oztix-wa/failed/poster.png"
          }
        ]
      },
      expired: [
        {
          path: "oztix-wa/old/poster.png",
          sizeBytes: 1200
        },
        {
          path: "oztix-wa/failed/poster.png",
          sizeBytes: 800
        }
      ],
      orphaned: [
        {
          path: "moshtix-wa/orphan/poster.jpg",
          sizeBytes: 300
        }
      ]
    });

    const result = await cleanupGigImages(store, {
      execute: true,
      now: new Date("2026-06-22T12:00:00.000Z")
    });

    expect(store.deletedPaths).toEqual([
      [
        "moshtix-wa/orphan/poster.jpg",
        "oztix-wa/failed/poster.png",
        "oztix-wa/old/poster.png"
      ]
    ]);
    expect(store.clearedPaths).toEqual([["oztix-wa/old/poster.png"]]);
    expect(result).toMatchObject({
      deletedBytes: 1500,
      deletedObjectCount: 2,
      dryRun: false,
      failedObjectCount: 1,
      selectedBytes: 2300,
      selectedObjectCount: 3,
      sourceGigRowsCleared: 2
    });
  });

  it("leaves DB image references intact for failed deletes", async () => {
    const clearSpy = vi.fn();
    const store = new FakeImageCleanupStore({
      deleteResult: {
        deletedPaths: [],
        failures: [
          {
            message: "delete failed",
            path: "oztix-wa/old/poster.png"
          }
        ]
      },
      expired: [
        {
          path: "oztix-wa/old/poster.png",
          sizeBytes: 1200
        }
      ]
    });
    store.clearExpiredMirroredImageReferences = clearSpy;

    const result = await cleanupGigImages(store, {
      execute: true,
      now: new Date("2026-06-22T12:00:00.000Z")
    });

    expect(clearSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      deletedObjectCount: 0,
      failedObjectCount: 1,
      sourceGigRowsCleared: 0
    });
  });
});
