import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ImageCleanupDeleteFailure,
  ImageCleanupDeleteResult,
  ImageCleanupObject
} from "../cleanup-images";
import { ensureImageBucket, IMAGE_MIRROR_BUCKET } from "../image-mirror";

interface MirroredImageReferenceRow {
  mirrored_image_path: string | null;
}

interface ExpiredMirroredImageReferenceRow extends MirroredImageReferenceRow {
  gigs:
    | {
        starts_at: string;
      }
    | Array<{
        starts_at: string;
      }>
    | null;
}

interface StorageObjectRow {
  id: string | null;
  metadata: { size?: number | string } | null;
  name: string;
}

const QUERY_CHUNK_SIZE = 100;
const STORAGE_PATH_MUTATION_CHUNK_SIZE = 20;

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function getSingleRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function getStorageObjectSize(row: StorageObjectRow): number {
  const rawSize = row.metadata?.size;
  const size = typeof rawSize === "number" ? rawSize : Number(rawSize ?? 0);

  return Number.isFinite(size) && size > 0 ? size : 0;
}

function joinStoragePath(prefix: string, name: string): string {
  return prefix ? `${prefix}/${name}` : name;
}

function uniqueNonEmptyValues(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export class SupabaseImageRepository {
  constructor(private readonly client: SupabaseClient) {}

  async ensureBucket(): Promise<void> {
    await ensureImageBucket(this.client);
  }

  private async listAllStorageImageObjects(): Promise<ImageCleanupObject[]> {
    const objects: ImageCleanupObject[] = [];
    const pendingPrefixes = [""];

    while (pendingPrefixes.length > 0) {
      const prefix = pendingPrefixes.pop() ?? "";

      for (let offset = 0; ; offset += QUERY_CHUNK_SIZE) {
        const { data, error } = await this.client.storage
          .from(IMAGE_MIRROR_BUCKET)
          .list(prefix, {
            limit: QUERY_CHUNK_SIZE,
            offset,
            sortBy: {
              column: "name",
              order: "asc"
            }
          });

        if (error) {
          throw new Error(`Unable to list mirrored image objects: ${error.message}`);
        }

        const rows = (data as StorageObjectRow[] | null) ?? [];

        for (const row of rows) {
          const path = joinStoragePath(prefix, row.name);

          if (row.id === null) {
            pendingPrefixes.push(path);
            continue;
          }

          objects.push({
            path,
            sizeBytes: getStorageObjectSize(row)
          });
        }

        if (rows.length < QUERY_CHUNK_SIZE) {
          break;
        }
      }
    }

    return objects.sort((left, right) => left.path.localeCompare(right.path));
  }

  private async listReferencedMirroredImagePaths(): Promise<Set<string>> {
    const paths = new Set<string>();

    for (let offset = 0; ; offset += QUERY_CHUNK_SIZE) {
      const { data, error } = await this.client
        .from("source_gigs")
        .select("mirrored_image_path")
        .not("mirrored_image_path", "is", null)
        .order("id", { ascending: true })
        .range(offset, offset + QUERY_CHUNK_SIZE - 1);

      if (error) {
        throw new Error(
          `Unable to list referenced mirrored image paths: ${error.message}`
        );
      }

      const rows = (data as MirroredImageReferenceRow[] | null) ?? [];

      for (const path of uniqueNonEmptyValues(
        rows.map((row) => row.mirrored_image_path)
      )) {
        paths.add(path);
      }

      if (rows.length < QUERY_CHUNK_SIZE) {
        return paths;
      }
    }
  }

  async listExpiredReferences(cutoffIso: string): Promise<ImageCleanupObject[]> {
    const paths = new Set<string>();

    for (let offset = 0; ; offset += QUERY_CHUNK_SIZE) {
      const { data, error } = await this.client
        .from("source_gigs")
        .select("mirrored_image_path, gigs!inner(starts_at)")
        .not("mirrored_image_path", "is", null)
        .lt("gigs.starts_at", cutoffIso)
        .order("id", { ascending: true })
        .range(offset, offset + QUERY_CHUNK_SIZE - 1);

      if (error) {
        throw new Error(
          `Unable to list expired mirrored image references: ${error.message}`
        );
      }

      const rows = (data as ExpiredMirroredImageReferenceRow[] | null) ?? [];

      for (const row of rows) {
        if (getSingleRelation(row.gigs)?.starts_at && row.mirrored_image_path) {
          paths.add(row.mirrored_image_path);
        }
      }

      if (rows.length < QUERY_CHUNK_SIZE) {
        break;
      }
    }

    if (paths.size === 0) {
      return [];
    }

    const protectedPaths = await this.listProtectedMirroredImagePaths(cutoffIso);
    const expiredOnlyPaths = [...paths].filter((path) => !protectedPaths.has(path));

    if (expiredOnlyPaths.length === 0) {
      return [];
    }

    return expiredOnlyPaths
      .sort((left, right) => left.localeCompare(right))
      .map((path) => ({
        path,
        sizeBytes: 0
      }));
  }

  private async listProtectedMirroredImagePaths(
    cutoffIso: string
  ): Promise<Set<string>> {
    const paths = new Set<string>();

    for (let offset = 0; ; offset += QUERY_CHUNK_SIZE) {
      const { data, error } = await this.client
        .from("source_gigs")
        .select("mirrored_image_path, gigs!inner(starts_at)")
        .not("mirrored_image_path", "is", null)
        .gte("gigs.starts_at", cutoffIso)
        .order("id", { ascending: true })
        .range(offset, offset + QUERY_CHUNK_SIZE - 1);

      if (error) {
        throw new Error(
          `Unable to list protected mirrored image references: ${error.message}`
        );
      }

      const rows = (data as ExpiredMirroredImageReferenceRow[] | null) ?? [];

      for (const path of uniqueNonEmptyValues(
        rows.map((row) => row.mirrored_image_path)
      )) {
        paths.add(path);
      }

      if (rows.length < QUERY_CHUNK_SIZE) {
        return paths;
      }
    }
  }

  async listOrphanedObjects(): Promise<ImageCleanupObject[]> {
    const [objects, referencedPaths] = await Promise.all([
      this.listAllStorageImageObjects(),
      this.listReferencedMirroredImagePaths()
    ]);

    return objects
      .filter((object) => !referencedPaths.has(object.path))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  async deleteObjects(paths: string[]): Promise<ImageCleanupDeleteResult> {
    const deletedPaths: string[] = [];
    const failures: ImageCleanupDeleteFailure[] = [];

    for (const pathChunk of chunkValues(
      [...new Set(paths)],
      STORAGE_PATH_MUTATION_CHUNK_SIZE
    )) {
      const { error } = await this.client.storage
        .from(IMAGE_MIRROR_BUCKET)
        .remove(pathChunk);

      if (error) {
        failures.push(
          ...pathChunk.map((path) => ({
            message: error.message,
            path
          }))
        );
        continue;
      }

      deletedPaths.push(...pathChunk);
    }

    return { deletedPaths, failures };
  }

  async clearExpiredReferences(paths: string[]): Promise<number> {
    let clearedCount = 0;

    for (const pathChunk of chunkValues(
      [...new Set(paths)],
      STORAGE_PATH_MUTATION_CHUNK_SIZE
    )) {
      const { data, error } = await this.client
        .from("source_gigs")
        .update({
          image_mirror_error: null,
          image_mirror_status: "pending",
          image_mirrored_at: null,
          mirrored_image_height: null,
          mirrored_image_path: null,
          mirrored_image_width: null
        })
        .in("mirrored_image_path", pathChunk)
        .select("id");

      if (error) {
        throw new Error(
          `Unable to clear expired mirrored image references: ${error.message}`
        );
      }

      clearedCount += data?.length ?? 0;
    }

    return clearedCount;
  }
}
