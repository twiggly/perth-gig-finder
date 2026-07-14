import { Buffer } from "node:buffer";

import sharp from "sharp";

import {
  IMAGE_MIRROR_MAX_BYTES,
  IMAGE_TRIM_THRESHOLD
} from "./constants";

const IMAGE_OPTIMIZATION_SCALE_STEPS = [1, 0.85, 0.7, 0.55, 0.4, 0.25] as const;
const IMAGE_OPTIMIZATION_QUALITY_STEPS = [84, 74, 64, 54, 44, 34] as const;

export interface PreparedMirroredImage {
  bytes: Buffer;
  contentType: string;
  width: number;
  height: number;
}
export function normalizeContentType(value: string | null): string | null {
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

export async function optimizeMirroredImageToFit(
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
