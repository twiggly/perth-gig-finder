import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ImageMirrorStatus,
  SourceGigImageMirrorResult,
  SourceGigRecord
} from "./types";

export const IMAGE_MIRROR_BUCKET = "gig-images";
export const IMAGE_MIRROR_TIMEOUT_MS = 10_000;
export const IMAGE_MIRROR_MAX_BYTES = 8 * 1024 * 1024;

const SUPPORTED_IMAGE_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"]
]);

function sha1Hex(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function normalizeContentType(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.split(";")[0]?.trim().toLowerCase();
  return normalized || null;
}

function isNotFoundBucketError(error: { status?: number; message?: string } | null): boolean {
  if (!error) {
    return false;
  }

  return error.status === 404 || /not found/i.test(error.message ?? "");
}

function toFailureResult(errorMessage: string): SourceGigImageMirrorResult {
  return {
    status: "failed",
    mirroredImagePath: null,
    errorMessage,
    mirroredAt: null
  };
}

export function buildMirroredImagePath(input: {
  sourceSlug: string;
  identityKey: string;
  sourceImageUrl: string;
  contentType: string;
}): string {
  const extension = SUPPORTED_IMAGE_TYPES.get(input.contentType);

  if (!extension) {
    throw new Error(`Unsupported image content type: ${input.contentType}`);
  }

  return [
    input.sourceSlug,
    input.identityKey,
    `${sha1Hex(input.sourceImageUrl)}.${extension}`
  ].join("/");
}

export async function ensureImageBucket(client: SupabaseClient): Promise<void> {
  const { data, error } = await client.storage.getBucket(IMAGE_MIRROR_BUCKET);

  if (data && !error) {
    return;
  }

  if (error && !isNotFoundBucketError(error)) {
    throw new Error(`Unable to inspect image bucket: ${error.message}`);
  }

  const { error: createError } = await client.storage.createBucket(IMAGE_MIRROR_BUCKET, {
    public: true,
    fileSizeLimit: IMAGE_MIRROR_MAX_BYTES,
    allowedMimeTypes: [...SUPPORTED_IMAGE_TYPES.keys()]
  });

  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`Unable to create image bucket: ${createError.message}`);
  }
}

export async function mirrorSourceImage(input: {
  sourceGig: SourceGigRecord;
  upload: (
    path: string,
    bytes: Buffer,
    options: { contentType: string }
  ) => Promise<{ error: { message: string } | null }>;
  fetchImpl?: typeof fetch;
  now?: () => string;
}): Promise<SourceGigImageMirrorResult> {
  if (!input.sourceGig.sourceImageUrl) {
    return {
      status: "missing",
      mirroredImagePath: null,
      errorMessage: null,
      mirroredAt: null
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_MIRROR_TIMEOUT_MS);

  try {
    const response = await fetchImpl(input.sourceGig.sourceImageUrl, {
      signal: controller.signal
    });

    if (!response.ok) {
      return toFailureResult(`Image request failed (${response.status})`);
    }

    const contentType = normalizeContentType(response.headers.get("content-type"));

    if (!contentType || !SUPPORTED_IMAGE_TYPES.has(contentType)) {
      return toFailureResult(
        `Unsupported image content type: ${contentType ?? "unknown"}`
      );
    }

    const contentLength = Number(response.headers.get("content-length") ?? "0");

    if (Number.isFinite(contentLength) && contentLength > IMAGE_MIRROR_MAX_BYTES) {
      return toFailureResult("Image exceeds 8 MB limit");
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.byteLength > IMAGE_MIRROR_MAX_BYTES) {
      return toFailureResult("Image exceeds 8 MB limit");
    }

    const mirroredImagePath = buildMirroredImagePath({
      sourceSlug: input.sourceGig.sourceSlug,
      identityKey: input.sourceGig.identityKey,
      sourceImageUrl: input.sourceGig.sourceImageUrl,
      contentType
    });

    const { error: uploadError } = await input.upload(mirroredImagePath, bytes, {
      contentType
    });

    if (uploadError) {
      return toFailureResult(`Image upload failed: ${uploadError.message}`);
    }

    return {
      status: "ready",
      mirroredImagePath,
      errorMessage: null,
      mirroredAt: (input.now ?? (() => new Date().toISOString()))()
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return toFailureResult("Image request timed out");
    }

    return toFailureResult(
      error instanceof Error ? `Image request failed: ${error.message}` : "Image request failed"
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export function shouldMirrorImage(sourceGig: SourceGigRecord): boolean {
  return Boolean(
    sourceGig.sourceImageUrl &&
      (sourceGig.imageMirrorStatus === "missing" ||
        sourceGig.imageMirrorStatus === "failed" ||
        !sourceGig.mirroredImagePath)
  );
}
