import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";

import type {
  ImageMirrorStatus,
  SourceGigImageMirrorResult,
  SourceGigRecord
} from "./types";

export const IMAGE_MIRROR_BUCKET = "gig-images";
export const IMAGE_MIRROR_TIMEOUT_MS = 10_000;
export const IMAGE_MIRROR_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_TRIM_THRESHOLD = 10;

const SUPPORTED_IMAGE_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"]
]);

interface PreparedMirroredImage {
  bytes: Buffer;
  width: number;
  height: number;
}

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

function applyOutputFormat(image: sharp.Sharp, contentType: string): sharp.Sharp {
  switch (contentType) {
    case "image/jpeg":
      return image.jpeg();
    case "image/png":
      return image.png();
    case "image/webp":
      return image.webp();
    case "image/avif":
      return image.avif();
    default:
      throw new Error(`Unsupported image content type: ${contentType}`);
  }
}

async function readImageDimensions(bytes: Buffer): Promise<{
  width: number;
  height: number;
}> {
  const metadata = await sharp(bytes).metadata();
  const width = metadata.width ?? null;
  const height = metadata.height ?? null;

  if (!width || !Number.isFinite(width) || !height || !Number.isFinite(height)) {
    throw new Error("Unable to read image dimensions");
  }

  return { width, height };
}

async function readRawImage(bytes: Buffer): Promise<{
  pixels: Buffer;
  width: number;
  height: number;
  channels: number;
}> {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    pixels: Buffer.from(data),
    width: info.width,
    height: info.height,
    channels: info.channels
  };
}

function pixelMatchesBackground(
  pixels: Buffer,
  offset: number,
  background: readonly number[]
): boolean {
  const pixelAlpha = pixels[offset + 3];
  const backgroundAlpha = background[3];

  // Fully transparent PNG borders often carry arbitrary hidden RGB values.
  // Treat near-transparent pixels as matching each other regardless of color.
  if (
    pixelAlpha <= IMAGE_TRIM_THRESHOLD &&
    backgroundAlpha <= IMAGE_TRIM_THRESHOLD
  ) {
    return true;
  }

  for (let channelIndex = 0; channelIndex < background.length; channelIndex += 1) {
    if (
      Math.abs(pixels[offset + channelIndex] - background[channelIndex]) >
      IMAGE_TRIM_THRESHOLD
    ) {
      return false;
    }
  }

  return true;
}

function findTrimBounds(input: {
  pixels: Buffer;
  width: number;
  height: number;
  channels: number;
}): { left: number; top: number; width: number; height: number } | null {
  if (input.channels < 4) {
    return null;
  }

  const background = [
    input.pixels[0],
    input.pixels[1],
    input.pixels[2],
    input.pixels[3]
  ] as const;

  const rowMatches = (y: number): boolean => {
    for (let x = 0; x < input.width; x += 1) {
      const offset = (y * input.width + x) * input.channels;

      if (!pixelMatchesBackground(input.pixels, offset, background)) {
        return false;
      }
    }

    return true;
  };

  let top = 0;
  while (top < input.height && rowMatches(top)) {
    top += 1;
  }

  if (top >= input.height) {
    return null;
  }

  let bottom = input.height - 1;
  while (bottom >= top && rowMatches(bottom)) {
    bottom -= 1;
  }

  const columnMatches = (x: number): boolean => {
    for (let y = top; y <= bottom; y += 1) {
      const offset = (y * input.width + x) * input.channels;

      if (!pixelMatchesBackground(input.pixels, offset, background)) {
        return false;
      }
    }

    return true;
  };

  let left = 0;
  while (left < input.width && columnMatches(left)) {
    left += 1;
  }

  let right = input.width - 1;
  while (right >= left && columnMatches(right)) {
    right -= 1;
  }

  const width = right - left + 1;
  const height = bottom - top + 1;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { left, top, width, height };
}

async function trimMirroredImage(input: {
  bytes: Buffer;
  contentType: string;
}): Promise<PreparedMirroredImage> {
  const rawImage = await readRawImage(input.bytes);
  const bounds = findTrimBounds(rawImage);

  if (!bounds) {
    const dimensions = await readImageDimensions(input.bytes);

    return {
      bytes: input.bytes,
      width: dimensions.width,
      height: dimensions.height
    };
  }

  const pipeline = applyOutputFormat(
    sharp(input.bytes).extract(bounds),
    input.contentType
  );
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

  return {
    bytes: Buffer.from(data),
    width: info.width,
    height: info.height
  };
}

export async function prepareMirroredImageForUpload(input: {
  bytes: Buffer;
  contentType: string;
  transform?: (input: {
    bytes: Buffer;
    contentType: string;
  }) => Promise<PreparedMirroredImage>;
}): Promise<PreparedMirroredImage> {
  const originalDimensions = await readImageDimensions(input.bytes);
  const originalImage: PreparedMirroredImage = {
    bytes: input.bytes,
    width: originalDimensions.width,
    height: originalDimensions.height
  };

  try {
    const transformed = await (input.transform ?? trimMirroredImage)({
      bytes: input.bytes,
      contentType: input.contentType
    });

    if (
      !transformed.bytes.byteLength ||
      !Number.isFinite(transformed.width) ||
      transformed.width <= 0 ||
      !Number.isFinite(transformed.height) ||
      transformed.height <= 0
    ) {
      return originalImage;
    }

    if (
      transformed.width > originalImage.width ||
      transformed.height > originalImage.height
    ) {
      return originalImage;
    }

    if (
      transformed.width === originalImage.width &&
      transformed.height === originalImage.height
    ) {
      return originalImage;
    }

    return transformed;
  } catch {
    return originalImage;
  }
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
    mirroredAt: null,
    mirroredImageWidth: null,
    mirroredImageHeight: null
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
      mirroredAt: null,
      mirroredImageWidth: null,
      mirroredImageHeight: null
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

    let preparedImage: PreparedMirroredImage;

    try {
      preparedImage = await prepareMirroredImageForUpload({
        bytes,
        contentType
      });
    } catch (error) {
      return toFailureResult(
        error instanceof Error
          ? `Unable to read image dimensions: ${error.message}`
          : "Unable to read image dimensions"
      );
    }

    const mirroredImagePath = buildMirroredImagePath({
      sourceSlug: input.sourceGig.sourceSlug,
      identityKey: input.sourceGig.identityKey,
      sourceImageUrl: input.sourceGig.sourceImageUrl,
      contentType
    });

    const { error: uploadError } = await input.upload(
      mirroredImagePath,
      preparedImage.bytes,
      {
        contentType
      }
    );

    if (uploadError) {
      return toFailureResult(`Image upload failed: ${uploadError.message}`);
    }

    return {
      status: "ready",
      mirroredImagePath,
      errorMessage: null,
      mirroredAt: (input.now ?? (() => new Date().toISOString()))(),
      mirroredImageWidth: preparedImage.width,
      mirroredImageHeight: preparedImage.height
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
        !sourceGig.mirroredImagePath ||
        !sourceGig.mirroredImageWidth ||
        !sourceGig.mirroredImageHeight)
  );
}
