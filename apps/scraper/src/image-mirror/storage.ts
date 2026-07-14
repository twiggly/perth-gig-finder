import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildContentAddressedGigImagePath,
  type ContentAddressedGigImageExtension
} from "@perth-gig-finder/shared";

import {
  IMAGE_MIRROR_BUCKET,
  IMAGE_MIRROR_MAX_BYTES
} from "./constants";

const SUPPORTED_IMAGE_TYPES = new Map<
  string,
  ContentAddressedGigImageExtension
>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"]
]);

export interface MirroredImageUploadError {
  message: string;
  status?: number;
  statusCode?: string;
}

function sha256Hex(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isNotFoundBucketError(
  error: { status?: number; message?: string } | null
): boolean {
  if (!error) {
    return false;
  }

  return error.status === 404 || /not found/i.test(error.message ?? "");
}

export function isSupportedImageContentType(contentType: string): boolean {
  return SUPPORTED_IMAGE_TYPES.has(contentType);
}

export function buildMirroredImagePath(input: {
  bytes: Uint8Array;
  contentType: string;
}): string {
  const extension = SUPPORTED_IMAGE_TYPES.get(input.contentType);

  if (!extension) {
    throw new Error(`Unsupported image content type: ${input.contentType}`);
  }

  return buildContentAddressedGigImagePath({
    extension,
    sha256: sha256Hex(input.bytes)
  });
}

export function isDuplicateMirroredImageUploadError(
  error: MirroredImageUploadError
): boolean {
  return (
    error.status === 409 ||
    error.statusCode?.toLowerCase() === "duplicate" ||
    /(?:already exists|duplicate)/i.test(error.message)
  );
}

export async function ensureImageBucket(client: SupabaseClient): Promise<void> {
  const { data, error } = await client.storage.getBucket(IMAGE_MIRROR_BUCKET);

  if (data && !error) {
    return;
  }

  if (error && !isNotFoundBucketError(error)) {
    throw new Error(`Unable to inspect image bucket: ${error.message}`);
  }

  const { error: createError } = await client.storage.createBucket(
    IMAGE_MIRROR_BUCKET,
    {
      public: true,
      fileSizeLimit: IMAGE_MIRROR_MAX_BYTES,
      allowedMimeTypes: [...SUPPORTED_IMAGE_TYPES.keys()]
    }
  );

  if (createError && !/already exists/i.test(createError.message)) {
    throw new Error(`Unable to create image bucket: ${createError.message}`);
  }
}
