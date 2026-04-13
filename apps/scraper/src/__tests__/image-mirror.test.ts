import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import {
  buildMirroredImagePath,
  IMAGE_MIRROR_MAX_BYTES,
  IMAGE_MIRROR_SOURCE_MAX_BYTES,
  mirrorSourceImage,
  prepareMirroredImageForUpload
} from "../image-mirror";
import type { SourceGigRecord } from "../types";

function createSourceGig(overrides: Partial<SourceGigRecord> = {}): SourceGigRecord {
  return {
    id: "source-gig-1",
    gigId: "gig-1",
    sourceSlug: "oztix-wa",
    identityKey: "doctor-jazz",
    sourceImageUrl: "https://assets.oztix.com.au/image/doctor-jazz.png",
    mirroredImagePath: null,
    imageMirrorStatus: "pending",
    imageMirroredAt: null,
    mirroredImageWidth: null,
    mirroredImageHeight: null,
    ...overrides
  };
}

async function createPngBuffer(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 249, g: 90, b: 55, alpha: 1 }
    }
  })
    .png()
    .toBuffer();
}

async function createLargePatternedPngBuffer(input: {
  height: number;
  transparent?: boolean;
  width: number;
}): Promise<Buffer> {
  const channels = input.transparent ? 4 : 3;
  const pixels = Buffer.alloc(input.width * input.height * channels);

  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const offset = (y * input.width + x) * channels;

      pixels[offset] = (x * 17 + y * 3) % 256;
      pixels[offset + 1] = (x * 11 + y * 5) % 256;
      pixels[offset + 2] = (x * 7 + y * 13) % 256;

      if (channels === 4) {
        pixels[offset + 3] = (x + y) % 5 === 0 ? 0 : 255;
      }
    }
  }

  return sharp(pixels, {
    raw: {
      channels,
      height: input.height,
      width: input.width
    }
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

async function createPaddedPngBuffer(input: {
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  top: number;
  left: number;
  outerBackground: { r: number; g: number; b: number; alpha: number };
  innerBackground: { r: number; g: number; b: number; alpha: number };
}): Promise<Buffer> {
  const innerImage = await sharp({
    create: {
      width: input.innerWidth,
      height: input.innerHeight,
      channels: 4,
      background: input.innerBackground
    }
  })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: input.width,
      height: input.height,
      channels: 4,
      background: input.outerBackground
    }
  })
    .composite([{ input: innerImage, left: input.left, top: input.top }])
    .png()
    .toBuffer();
}

async function createTransparentPngBufferWithHiddenRgb(input: {
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  top: number;
  left: number;
}): Promise<Buffer> {
  const channels = 4;
  const pixels = Buffer.alloc(input.width * input.height * channels);

  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      const offset = (y * input.width + x) * channels;
      const isInsideInnerBounds =
        x >= input.left &&
        x < input.left + input.innerWidth &&
        y >= input.top &&
        y < input.top + input.innerHeight;

      if (isInsideInnerBounds) {
        pixels[offset] = 249;
        pixels[offset + 1] = 90;
        pixels[offset + 2] = 55;
        pixels[offset + 3] = 255;
      } else {
        pixels[offset] = (x * 17 + y * 3) % 256;
        pixels[offset + 1] = (x * 11 + y * 5) % 256;
        pixels[offset + 2] = (x * 7 + y * 13) % 256;
        pixels[offset + 3] = 0;
      }
    }
  }

  return sharp(pixels, {
    raw: {
      width: input.width,
      height: input.height,
      channels
    }
  })
    .png()
    .toBuffer();
}

describe("image mirroring", () => {
  it("builds a deterministic mirrored path from the source URL", () => {
    expect(
      buildMirroredImagePath({
        sourceSlug: "oztix-wa",
        identityKey: "doctor-jazz",
        sourceImageUrl: "https://assets.oztix.com.au/image/doctor-jazz.png",
        contentType: "image/png"
      })
    ).toBe("oztix-wa/doctor-jazz/5943d2e0e12f27d05a36af1afca56326645f0dfe.png");
  });

  it("rejects unsupported content types without uploading", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("gif", {
        status: 200,
        headers: { "content-type": "image/gif" }
      })
    );

    const result = await mirrorSourceImage({
      sourceGig: createSourceGig(),
      fetchImpl: fetchMock,
      upload
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("Unsupported image content type");
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects source images above the source max limit", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("too-big", {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(IMAGE_MIRROR_SOURCE_MAX_BYTES + 1)
        }
      })
    );

    const result = await mirrorSourceImage({
      sourceGig: createSourceGig(),
      fetchImpl: fetchMock,
      upload
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("32 MB");
    expect(upload).not.toHaveBeenCalled();
  });

  it("optimizes oversized opaque images into a smaller lossy format", async () => {
    const imageBuffer = await createLargePatternedPngBuffer({
      height: 1700,
      width: 1700
    });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(new Uint8Array(imageBuffer), {
        status: 200,
        headers: {
          "content-length": String(imageBuffer.byteLength),
          "content-type": "image/png"
        }
      })
    );

    expect(imageBuffer.byteLength).toBeGreaterThan(IMAGE_MIRROR_MAX_BYTES);

    const result = await mirrorSourceImage({
      sourceGig: createSourceGig(),
      fetchImpl: fetchMock,
      upload
    });

    expect(result.status).toBe("ready");
    expect(result.mirroredImageWidth).toBeGreaterThan(0);
    expect(result.mirroredImageHeight).toBeGreaterThan(0);
    expect(result.mirroredImagePath).toMatch(/\.jpg$/);
    expect(upload).toHaveBeenCalledTimes(1);

    const [path, uploadedBytes, options] = upload.mock.calls[0]!;
    const metadata = await sharp(uploadedBytes).metadata();

    expect(path).toMatch(/\.jpg$/);
    expect(options).toEqual({ contentType: "image/jpeg" });
    expect(uploadedBytes.byteLength).toBeLessThanOrEqual(IMAGE_MIRROR_MAX_BYTES);
    expect(metadata.format).toBe("jpeg");
    expect(metadata.hasAlpha).toBe(false);
  });

  it("optimizes oversized transparent images into a smaller alpha-safe format", async () => {
    const imageBuffer = await createLargePatternedPngBuffer({
      height: 1700,
      transparent: true,
      width: 1700
    });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(new Uint8Array(imageBuffer), {
        status: 200,
        headers: {
          "content-length": String(imageBuffer.byteLength),
          "content-type": "image/png"
        }
      })
    );

    expect(imageBuffer.byteLength).toBeGreaterThan(IMAGE_MIRROR_MAX_BYTES);

    const result = await mirrorSourceImage({
      sourceGig: createSourceGig(),
      fetchImpl: fetchMock,
      upload
    });

    expect(result.status).toBe("ready");
    expect(result.mirroredImagePath).toMatch(/\.webp$/);
    expect(upload).toHaveBeenCalledTimes(1);

    const [path, uploadedBytes, options] = upload.mock.calls[0]!;
    const metadata = await sharp(uploadedBytes).metadata();

    expect(path).toMatch(/\.webp$/);
    expect(options).toEqual({ contentType: "image/webp" });
    expect(uploadedBytes.byteLength).toBeLessThanOrEqual(IMAGE_MIRROR_MAX_BYTES);
    expect(metadata.format).toBe("webp");
    expect(metadata.hasAlpha).toBe(true);
  });

  it("trims transparent outer padding before upload", async () => {
    const imageBuffer = await createPaddedPngBuffer({
      width: 10,
      height: 8,
      innerWidth: 4,
      innerHeight: 2,
      top: 3,
      left: 3,
      outerBackground: { r: 0, g: 0, b: 0, alpha: 0 },
      innerBackground: { r: 249, g: 90, b: 55, alpha: 1 }
    });

    const prepared = await prepareMirroredImageForUpload({
      bytes: imageBuffer,
      contentType: "image/png"
    });

    expect(prepared.width).toBe(4);
    expect(prepared.height).toBe(2);
    expect(prepared.bytes.equals(imageBuffer)).toBe(false);

    const metadata = await sharp(prepared.bytes).metadata();
    expect(metadata.width).toBe(4);
    expect(metadata.height).toBe(2);
  });

  it("trims transparent outer padding even when hidden RGB values vary", async () => {
    const imageBuffer = await createTransparentPngBufferWithHiddenRgb({
      width: 12,
      height: 8,
      innerWidth: 4,
      innerHeight: 2,
      top: 3,
      left: 4
    });

    const prepared = await prepareMirroredImageForUpload({
      bytes: imageBuffer,
      contentType: "image/png"
    });

    expect(prepared.width).toBe(4);
    expect(prepared.height).toBe(2);
    expect(prepared.bytes.equals(imageBuffer)).toBe(false);

    const { data, info } = await sharp(prepared.bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (let offset = 3; offset < data.length; offset += info.channels) {
      expect(data[offset]).toBe(255);
    }
  });

  it("trims uniform-color outer padding before upload", async () => {
    const imageBuffer = await createPaddedPngBuffer({
      width: 12,
      height: 10,
      innerWidth: 6,
      innerHeight: 4,
      top: 2,
      left: 3,
      outerBackground: { r: 255, g: 255, b: 255, alpha: 1 },
      innerBackground: { r: 20, g: 30, b: 40, alpha: 1 }
    });

    const prepared = await prepareMirroredImageForUpload({
      bytes: imageBuffer,
      contentType: "image/png"
    });

    expect(prepared.width).toBe(6);
    expect(prepared.height).toBe(4);

    const metadata = await sharp(prepared.bytes).metadata();
    expect(metadata.width).toBe(6);
    expect(metadata.height).toBe(4);
  });

  it("keeps the original bytes when trimming does not improve the image", async () => {
    const imageBuffer = await createPngBuffer(4, 2);

    const prepared = await prepareMirroredImageForUpload({
      bytes: imageBuffer,
      contentType: "image/png"
    });

    expect(prepared.width).toBe(4);
    expect(prepared.height).toBe(2);
    expect(prepared.bytes.equals(imageBuffer)).toBe(true);
  });

  it("keeps the original bytes when trim processing fails", async () => {
    const imageBuffer = await createPngBuffer(4, 2);

    const prepared = await prepareMirroredImageForUpload({
      bytes: imageBuffer,
      contentType: "image/png",
      transform: async () => {
        throw new Error("boom");
      }
    });

    expect(prepared.width).toBe(4);
    expect(prepared.height).toBe(2);
    expect(prepared.bytes.equals(imageBuffer)).toBe(true);
  });

  it("uploads supported source images and returns a ready state", async () => {
    const imageBuffer = await createPngBuffer(4, 2);
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(new Uint8Array(imageBuffer), {
        status: 200,
        headers: { "content-type": "image/png" }
      })
    );

    const result = await mirrorSourceImage({
      sourceGig: createSourceGig(),
      fetchImpl: fetchMock,
      upload,
      now: () => "2026-04-06T08:00:00.000Z"
    });

    expect(result).toEqual({
      status: "ready",
      mirroredImagePath: "oztix-wa/doctor-jazz/5943d2e0e12f27d05a36af1afca56326645f0dfe.png",
      errorMessage: null,
      mirroredAt: "2026-04-06T08:00:00.000Z",
      mirroredImageWidth: 4,
      mirroredImageHeight: 2
    });
    expect(upload).toHaveBeenCalledWith(
      "oztix-wa/doctor-jazz/5943d2e0e12f27d05a36af1afca56326645f0dfe.png",
      imageBuffer,
      { contentType: "image/png" }
    );
  });
});
