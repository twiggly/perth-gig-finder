import { Buffer } from "node:buffer";

import type {
  SourceGigImageMirrorResult,
  SourceGigRecord
} from "./types";
import {
  IMAGE_MIRROR_MAX_BYTES,
  IMAGE_MIRROR_SOURCE_MAX_BYTES,
  IMAGE_MIRROR_TIMEOUT_MS
} from "./image-mirror/constants";
import {
  defaultResolveImageHostname,
  fetchImageWithRedirects,
  type ImageHostResolver
} from "./image-mirror/request";
import {
  normalizeContentType,
  optimizeMirroredImageToFit,
  prepareMirroredImageForUpload,
  type PreparedMirroredImage
} from "./image-mirror/processing";
import {
  buildMirroredImagePath,
  isDuplicateMirroredImageUploadError,
  isSupportedImageContentType,
  type MirroredImageUploadError
} from "./image-mirror/storage";

export {
  IMAGE_MIRROR_BUCKET,
  IMAGE_MIRROR_MAX_BYTES,
  IMAGE_MIRROR_MAX_REDIRECTS,
  IMAGE_MIRROR_SOURCE_MAX_BYTES,
  IMAGE_MIRROR_TIMEOUT_MS,
  IMAGE_TRIM_THRESHOLD
} from "./image-mirror/constants";
export { isUnsafeImageIpAddress } from "./image-mirror/request";
export type { ImageHostResolver } from "./image-mirror/request";
export { prepareMirroredImageForUpload } from "./image-mirror/processing";
export {
  buildMirroredImagePath,
  ensureImageBucket
} from "./image-mirror/storage";

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

export async function mirrorSourceImage(input: {
  sourceGig: SourceGigRecord;
  upload: (
    path: string,
    bytes: Buffer,
    options: { contentType: string }
  ) => Promise<{ error: MirroredImageUploadError | null }>;
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

    if (!contentType || !isSupportedImageContentType(contentType)) {
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
      bytes: preparedImage.bytes,
      contentType: preparedImage.contentType
    });

    const { error: uploadError } = await input.upload(
      mirroredImagePath,
      preparedImage.bytes,
      {
        contentType: preparedImage.contentType
      }
    );

    if (uploadError && !isDuplicateMirroredImageUploadError(uploadError)) {
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
