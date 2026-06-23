import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeAbsoluteHttpUrl } from "@perth-gig-finder/shared";
import sharp from "sharp";

import type {
  ImageMirrorStatus,
  SourceGigImageMirrorResult,
  SourceGigRecord
} from "./types";

export const IMAGE_MIRROR_BUCKET = "gig-images";
export const IMAGE_MIRROR_TIMEOUT_MS = 10_000;
export const IMAGE_MIRROR_MAX_BYTES = 8 * 1024 * 1024;
export const IMAGE_MIRROR_SOURCE_MAX_BYTES = 32 * 1024 * 1024;
export const IMAGE_MIRROR_MAX_REDIRECTS = 5;
export const IMAGE_TRIM_THRESHOLD = 10;
const IMAGE_OPTIMIZATION_SCALE_STEPS = [1, 0.85, 0.7, 0.55, 0.4, 0.25] as const;
const IMAGE_OPTIMIZATION_QUALITY_STEPS = [84, 74, 64, 54, 44, 34] as const;

const SUPPORTED_IMAGE_TYPES = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"]
]);

interface PreparedMirroredImage {
  bytes: Buffer;
  contentType: string;
  width: number;
  height: number;
}

export type ImageHostResolver = (hostname: string) => Promise<readonly string[]>;

interface SafeImageUrlResult {
  errorMessage: string | null;
  url: string | null;
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

async function readImageCharacteristics(bytes: Buffer): Promise<{
  hasAlpha: boolean;
  height: number;
  width: number;
}> {
  const metadata = await sharp(bytes).metadata();
  const width = metadata.width ?? null;
  const height = metadata.height ?? null;

  if (!width || !Number.isFinite(width) || !height || !Number.isFinite(height)) {
    throw new Error("Unable to read image dimensions");
  }

  return {
    hasAlpha: metadata.hasAlpha === true,
    height,
    width
  };
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
      contentType: input.contentType,
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
    contentType: input.contentType,
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
    contentType: input.contentType,
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

function applyOptimizedOutputFormat(input: {
  contentType: string;
  image: sharp.Sharp;
  quality: number;
}): sharp.Sharp {
  if (input.contentType === "image/jpeg") {
    return input.image.jpeg({
      mozjpeg: true,
      quality: input.quality
    });
  }

  return input.image.webp({
    alphaQuality: input.quality,
    effort: 4,
    quality: input.quality
  });
}

function getOversizedImageTargetContentType(hasAlpha: boolean): string {
  return hasAlpha ? "image/webp" : "image/jpeg";
}

async function optimizeMirroredImageToFit(
  input: PreparedMirroredImage
): Promise<PreparedMirroredImage | null> {
  if (input.bytes.byteLength <= IMAGE_MIRROR_MAX_BYTES) {
    return input;
  }

  const characteristics = await readImageCharacteristics(input.bytes);
  const targetContentType = getOversizedImageTargetContentType(
    characteristics.hasAlpha
  );

  for (const scale of IMAGE_OPTIMIZATION_SCALE_STEPS) {
    const targetWidth = Math.max(1, Math.round(input.width * scale));
    const targetHeight = Math.max(1, Math.round(input.height * scale));

    for (const quality of IMAGE_OPTIMIZATION_QUALITY_STEPS) {
      let pipeline = sharp(input.bytes, { animated: false });

      if (targetWidth !== input.width || targetHeight !== input.height) {
        pipeline = pipeline.resize({
          fit: "inside",
          height: targetHeight,
          width: targetWidth,
          withoutEnlargement: true
        });
      }

      const { data, info } = await applyOptimizedOutputFormat({
        contentType: targetContentType,
        image: pipeline,
        quality
      }).toBuffer({ resolveWithObject: true });

      if (data.byteLength <= IMAGE_MIRROR_MAX_BYTES) {
        return {
          bytes: Buffer.from(data),
          contentType: targetContentType,
          height: info.height,
          width: info.width
        };
      }
    }
  }

  return null;
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

function stripIpBrackets(value: string): string {
  return value.replace(/^\[/, "").replace(/\]$/, "");
}

function isLocalhostHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost" || normalized.endsWith(".localhost");
}

function parseIpv4Address(address: string): [number, number, number, number] | null {
  const parts = address.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const octets = parts.map((part) => Number.parseInt(part, 10));

  if (
    octets.some(
      (octet, index) =>
        !/^\d+$/.test(parts[index] ?? "") ||
        !Number.isInteger(octet) ||
        octet < 0 ||
        octet > 255
    )
  ) {
    return null;
  }

  return octets as [number, number, number, number];
}

export function isUnsafeImageIpAddress(address: string): boolean {
  const normalized = stripIpBrackets(address).toLowerCase();
  const mappedIpv4Match = normalized.includes(":")
    ? normalized.match(/(?:::ffff:)?(\d+\.\d+\.\d+\.\d+)$/)
    : null;

  if (mappedIpv4Match) {
    return isUnsafeImageIpAddress(mappedIpv4Match[1]!);
  }

  if (isIP(normalized) === 4) {
    const octets = parseIpv4Address(normalized);

    if (!octets) {
      return true;
    }

    const [first, second, third] = octets;

    return (
      first === 0 ||
      first === 10 ||
      first === 127 ||
      first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 88 && third === 99) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113)
    );
  }

  if (isIP(normalized) === 6) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized === "0:0:0:0:0:0:0:0" ||
      normalized === "0:0:0:0:0:0:0:1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      /^fe[89ab]/.test(normalized) ||
      normalized.startsWith("ff") ||
      normalized.startsWith("2001:db8:") ||
      normalized === "2001:db8::" ||
      normalized.startsWith("2001:0db8:") ||
      normalized.startsWith("2001:10:") ||
      normalized.startsWith("2001:0010:") ||
      normalized.startsWith("2002:")
    );
  }

  return true;
}

async function defaultResolveImageHostname(
  hostname: string
): Promise<readonly string[]> {
  const records = await lookup(hostname, {
    all: true,
    verbatim: true
  });

  return records.map((record) => record.address);
}

async function validateImageRequestUrl(input: {
  resolveHostname: ImageHostResolver;
  url: string;
}): Promise<SafeImageUrlResult> {
  const normalizedUrl = normalizeAbsoluteHttpUrl(input.url);

  if (!normalizedUrl) {
    return {
      errorMessage: "Unsupported image URL",
      url: null
    };
  }

  const parsedUrl = new URL(normalizedUrl);
  const hostname = stripIpBrackets(parsedUrl.hostname).toLowerCase();

  if (isLocalhostHostname(hostname)) {
    return {
      errorMessage: "Unsafe image host",
      url: null
    };
  }

  let resolvedAddresses: readonly string[];

  try {
    resolvedAddresses =
      isIP(hostname) === 0 ? await input.resolveHostname(hostname) : [hostname];
  } catch {
    return {
      errorMessage: "Unable to resolve image host",
      url: null
    };
  }

  if (resolvedAddresses.length === 0) {
    return {
      errorMessage: "Unable to resolve image host",
      url: null
    };
  }

  if (resolvedAddresses.some((address) => isUnsafeImageIpAddress(address))) {
    return {
      errorMessage: "Unsafe image host",
      url: null
    };
  }

  return {
    errorMessage: null,
    url: normalizedUrl
  };
}

async function fetchImageWithRedirects(input: {
  fetchImpl: typeof fetch;
  resolveHostname: ImageHostResolver;
  signal: AbortSignal;
  url: string;
}): Promise<{ errorMessage: string | null; response: Response | null }> {
  let currentUrl = input.url;

  for (let redirectCount = 0; redirectCount <= IMAGE_MIRROR_MAX_REDIRECTS; redirectCount += 1) {
    const safeUrl = await validateImageRequestUrl({
      resolveHostname: input.resolveHostname,
      url: currentUrl
    });

    if (!safeUrl.url) {
      return {
        errorMessage: safeUrl.errorMessage,
        response: null
      };
    }

    const response = await input.fetchImpl(safeUrl.url, {
      redirect: "manual",
      signal: input.signal
    });

    if (response.status < 300 || response.status >= 400) {
      return {
        errorMessage: null,
        response
      };
    }

    if (redirectCount >= IMAGE_MIRROR_MAX_REDIRECTS) {
      return {
        errorMessage: "Image request exceeded redirect limit",
        response: null
      };
    }

    const location = response.headers.get("location");

    if (!location) {
      return {
        errorMessage: "Image redirect missing location",
        response: null
      };
    }

    try {
      currentUrl = new URL(location, safeUrl.url).toString();
    } catch {
      return {
        errorMessage: "Image redirect location is invalid",
        response: null
      };
    }
  }

  return {
    errorMessage: "Image request exceeded redirect limit",
    response: null
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
  resolveHostname?: ImageHostResolver;
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
  const resolveHostname = input.resolveHostname ?? defaultResolveImageHostname;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_MIRROR_TIMEOUT_MS);

  try {
    const imageRequest = await fetchImageWithRedirects({
      fetchImpl,
      resolveHostname,
      url: input.sourceGig.sourceImageUrl,
      signal: controller.signal
    });

    if (!imageRequest.response) {
      return toFailureResult(imageRequest.errorMessage ?? "Image request failed");
    }

    const response = imageRequest.response;

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

    if (
      Number.isFinite(contentLength) &&
      contentLength > IMAGE_MIRROR_SOURCE_MAX_BYTES
    ) {
      return toFailureResult("Source image exceeds 32 MB limit");
    }

    const bytes = Buffer.from(await response.arrayBuffer());

    if (bytes.byteLength > IMAGE_MIRROR_SOURCE_MAX_BYTES) {
      return toFailureResult("Source image exceeds 32 MB limit");
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

    if (preparedImage.bytes.byteLength > IMAGE_MIRROR_MAX_BYTES) {
      const optimizedImage = await optimizeMirroredImageToFit(preparedImage);

      if (!optimizedImage) {
        return toFailureResult("Image could not be reduced under 8 MB limit");
      }

      preparedImage = optimizedImage;
    }

    const mirroredImagePath = buildMirroredImagePath({
      contentType: preparedImage.contentType,
      sourceSlug: input.sourceGig.sourceSlug,
      identityKey: input.sourceGig.identityKey,
      sourceImageUrl: input.sourceGig.sourceImageUrl
    });

    const { error: uploadError } = await input.upload(
      mirroredImagePath,
      preparedImage.bytes,
      {
        contentType: preparedImage.contentType
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

export function shouldMirrorImageForGig(input: {
  force?: boolean;
  gigStartsAt: string;
  gigStatus: string;
  now?: Date;
  sourceGig: SourceGigRecord;
}): boolean {
  if (!input.sourceGig.sourceImageUrl) {
    return false;
  }

  if (input.gigStatus !== "active") {
    return false;
  }

  const startsAtMs = new Date(input.gigStartsAt).getTime();

  if (!Number.isFinite(startsAtMs)) {
    return false;
  }

  if (startsAtMs < (input.now ?? new Date()).getTime()) {
    return false;
  }

  return input.force ? true : shouldMirrorImage(input.sourceGig);
}
