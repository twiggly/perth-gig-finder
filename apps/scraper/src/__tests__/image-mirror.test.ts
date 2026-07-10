import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import {
  buildMirroredImagePath,
  type ImageHostResolver,
  IMAGE_MIRROR_MAX_REDIRECTS,
  IMAGE_MIRROR_MAX_BYTES,
  IMAGE_MIRROR_SOURCE_MAX_BYTES,
  mirrorSourceImage,
  prepareMirroredImageForUpload,
  shouldMirrorImageForGig
} from "../image-mirror";
import type { SourceGigRecord } from "../types";

function createSourceGig(overrides: Partial<SourceGigRecord> = {}): SourceGigRecord {
  return {
    id: "source-gig-1",
    gigId: "gig-1",
    sourceSlug: "oztix-wa",
    externalId: "doctor-jazz",
    identityKey: "doctor-jazz",
    checksum: "doctor-jazz-checksum",
    sourceUrl: "https://tickets.oztix.com.au/outlet/event/doctor-jazz",
    startsAtPrecision: "exact",
    artistNames: [],
    artistExtractionKind: "unknown",
    sourceImageUrl: "https://assets.oztix.com.au/image/doctor-jazz.png",
    mirroredImagePath: null,
    imageMirrorStatus: "pending",
    imageMirroredAt: null,
    mirroredImageWidth: null,
    mirroredImageHeight: null,
    ...overrides
  };
}

function getExpectedMirroredImagePath(
  bytes: Uint8Array,
  extension: string
): string {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return `sha256/${sha256.slice(0, 2)}/${sha256}.${extension}`;
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

function createPublicImageHostResolver(): ImageHostResolver {
  return vi.fn(async () => ["93.184.216.34"]);
}

function mirrorSourceImageForTest(
  input: Parameters<typeof mirrorSourceImage>[0]
) {
  return mirrorSourceImage({
    resolveHostname: createPublicImageHostResolver(),
    ...input
  });
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
  it("builds a deterministic mirrored path from the final image bytes", () => {
    const bytes = Buffer.from("final mirrored poster bytes");

    expect(buildMirroredImagePath({ bytes, contentType: "image/png" })).toBe(
      getExpectedMirroredImagePath(bytes, "png")
    );
  });

  it("uses the same global path for identical bytes and a new path for changed bytes", () => {
    const sharedBytes = Buffer.from("shared poster");
    const changedBytes = Buffer.from("changed poster");
    const firstPath = buildMirroredImagePath({
      bytes: sharedBytes,
      contentType: "image/jpeg"
    });

    expect(
      buildMirroredImagePath({
        bytes: Buffer.from(sharedBytes),
        contentType: "image/jpeg"
      })
    ).toBe(firstPath);
    expect(
      buildMirroredImagePath({
        bytes: changedBytes,
        contentType: "image/jpeg"
      })
    ).not.toBe(firstPath);
  });

  it("shares one path across different source gigs with identical final bytes", async () => {
    const imageBuffer = await createPngBuffer(4, 2);
    const mirrorForSourceGig = async (sourceGig: SourceGigRecord) => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
        new Response(new Uint8Array(imageBuffer), {
          status: 200,
          headers: { "content-type": "image/png" }
        })
      );

      return mirrorSourceImageForTest({
        sourceGig,
        fetchImpl: fetchMock,
        upload: vi.fn().mockResolvedValue({ error: null })
      });
    };

    const firstResult = await mirrorForSourceGig(createSourceGig());
    const secondResult = await mirrorForSourceGig(
      createSourceGig({
        id: "source-gig-2",
        identityKey: "another-gig",
        sourceImageUrl: "https://images.example.com/another-gig.png",
        sourceSlug: "another-source"
      })
    );

    expect(firstResult.mirroredImagePath).toBe(secondResult.mirroredImagePath);
  });

  it("mirrors upcoming active gigs with incomplete image state", () => {
    expect(
      shouldMirrorImageForGig({
        gigStartsAt: "2026-06-24T10:00:00.000Z",
        gigStatus: "active",
        now: new Date("2026-06-22T10:00:00.000Z"),
        sourceGig: createSourceGig({
          imageMirrorStatus: "failed"
        })
      })
    ).toBe(true);
  });

  it("does not mirror past gigs", () => {
    expect(
      shouldMirrorImageForGig({
        gigStartsAt: "2026-06-21T10:00:00.000Z",
        gigStatus: "active",
        now: new Date("2026-06-22T10:00:00.000Z"),
        sourceGig: createSourceGig({
          imageMirrorStatus: "failed"
        })
      })
    ).toBe(false);
  });

  it("does not force-remirror past gigs", () => {
    expect(
      shouldMirrorImageForGig({
        force: true,
        gigStartsAt: "2026-06-21T10:00:00.000Z",
        gigStatus: "active",
        now: new Date("2026-06-22T10:00:00.000Z"),
        sourceGig: createSourceGig({
          imageMirrorStatus: "ready",
          mirroredImageHeight: 900,
          mirroredImagePath: "oztix-wa/doctor-jazz/mirrored.png",
          mirroredImageWidth: 1200
        })
      })
    ).toBe(false);
  });

  it("force-remirrors upcoming active gigs with ready image state", () => {
    expect(
      shouldMirrorImageForGig({
        force: true,
        gigStartsAt: "2026-06-24T10:00:00.000Z",
        gigStatus: "active",
        now: new Date("2026-06-22T10:00:00.000Z"),
        sourceGig: createSourceGig({
          imageMirrorStatus: "ready",
          mirroredImageHeight: 900,
          mirroredImagePath: "oztix-wa/doctor-jazz/mirrored.png",
          mirroredImageWidth: 1200
        })
      })
    ).toBe(true);
  });

  it.each([
    ["unsupported scheme", "ftp://images.example.com/poster.png"],
    ["credentials", "https://user:pass@images.example.com/poster.png"],
    ["localhost", "https://localhost/poster.png"],
    ["private IPv4", "https://10.0.0.1/poster.png"],
    ["private IPv6", "https://[::1]/poster.png"]
  ])("rejects unsafe image URLs before fetch: %s", async (_label, sourceImageUrl) => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>();

    const result = await mirrorSourceImageForTest({
      sourceGig: createSourceGig({
        sourceImageUrl
      }),
      fetchImpl: fetchMock,
      upload
    });

    expect(result.status).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects hostnames that resolve to private addresses before fetch", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>();
    const resolveHostname = vi.fn<ImageHostResolver>(async () => ["192.168.0.10"]);

    const result = await mirrorSourceImage({
      sourceGig: createSourceGig({
        sourceImageUrl: "https://images.example.com/poster.png"
      }),
      fetchImpl: fetchMock,
      resolveHostname,
      upload
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("Unsafe image host");
    expect(resolveHostname).toHaveBeenCalledWith("images.example.com");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("follows safe redirects before mirroring the image", async () => {
    const imageBuffer = await createPngBuffer(4, 2);
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "https://cdn.example.com/poster.png" }
        })
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array(imageBuffer), {
          status: 200,
          headers: { "content-type": "image/png" }
        })
      );

    const result = await mirrorSourceImageForTest({
      sourceGig: createSourceGig({
        sourceImageUrl: "https://images.example.com/start.png"
      }),
      fetchImpl: fetchMock,
      upload
    });

    expect(result.status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://images.example.com/start.png");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://cdn.example.com/poster.png");
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("rejects unsafe redirects before following them", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "http://127.0.0.1/poster.png" }
      })
    );

    const result = await mirrorSourceImageForTest({
      sourceGig: createSourceGig({
        sourceImageUrl: "https://images.example.com/start.png"
      }),
      fetchImpl: fetchMock,
      upload
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("Unsafe image host");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
  });

  it("enforces a redirect limit", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      const currentRedirect = Number(url.searchParams.get("redirect") ?? "0");
      return new Response(null, {
        status: 302,
        headers: {
          location: `https://images.example.com/poster.png?redirect=${currentRedirect + 1}`
        }
      });
    });

    const result = await mirrorSourceImageForTest({
      sourceGig: createSourceGig({
        sourceImageUrl: "https://images.example.com/poster.png?redirect=0"
      }),
      fetchImpl: fetchMock,
      upload
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("redirect limit");
    expect(fetchMock).toHaveBeenCalledTimes(IMAGE_MIRROR_MAX_REDIRECTS + 1);
    expect(upload).not.toHaveBeenCalled();
  });

  it("rejects unsupported content types without uploading", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("gif", {
        status: 200,
        headers: { "content-type": "image/gif" }
      })
    );

    const result = await mirrorSourceImageForTest({
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

    const result = await mirrorSourceImageForTest({
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

    const result = await mirrorSourceImageForTest({
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

    expect(path).toBe(getExpectedMirroredImagePath(uploadedBytes, "jpg"));
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

    const result = await mirrorSourceImageForTest({
      sourceGig: createSourceGig(),
      fetchImpl: fetchMock,
      upload
    });

    expect(result.status).toBe("ready");
    expect(result.mirroredImagePath).toMatch(/\.webp$/);
    expect(upload).toHaveBeenCalledTimes(1);

    const [path, uploadedBytes, options] = upload.mock.calls[0]!;
    const metadata = await sharp(uploadedBytes).metadata();

    expect(path).toBe(getExpectedMirroredImagePath(uploadedBytes, "webp"));
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

    const result = await mirrorSourceImageForTest({
      sourceGig: createSourceGig(),
      fetchImpl: fetchMock,
      upload,
      now: () => "2026-04-06T08:00:00.000Z"
    });
    const expectedPath = getExpectedMirroredImagePath(imageBuffer, "png");

    expect(result).toEqual({
      status: "ready",
      mirroredImagePath: expectedPath,
      errorMessage: null,
      mirroredAt: "2026-04-06T08:00:00.000Z",
      mirroredImageWidth: 4,
      mirroredImageHeight: 2
    });
    expect(upload).toHaveBeenCalledWith(
      expectedPath,
      imageBuffer,
      { contentType: "image/png" }
    );
  });

  it("treats an existing content-addressed object as a successful upload", async () => {
    const imageBuffer = await createPngBuffer(4, 2);
    const upload = vi.fn().mockResolvedValue({
      error: {
        message: "The resource already exists",
        status: 409,
        statusCode: "Duplicate"
      }
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(new Uint8Array(imageBuffer), {
        status: 200,
        headers: { "content-type": "image/png" }
      })
    );

    const result = await mirrorSourceImageForTest({
      sourceGig: createSourceGig(),
      fetchImpl: fetchMock,
      upload
    });

    expect(result.status).toBe("ready");
    expect(result.mirroredImagePath).toBe(
      getExpectedMirroredImagePath(imageBuffer, "png")
    );
  });

  it("keeps non-duplicate upload errors as mirror failures", async () => {
    const imageBuffer = await createPngBuffer(4, 2);
    const upload = vi.fn().mockResolvedValue({
      error: {
        message: "Storage unavailable",
        status: 503,
        statusCode: "InternalError"
      }
    });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(new Uint8Array(imageBuffer), {
        status: 200,
        headers: { "content-type": "image/png" }
      })
    );

    const result = await mirrorSourceImageForTest({
      sourceGig: createSourceGig(),
      fetchImpl: fetchMock,
      upload
    });

    expect(result).toMatchObject({
      status: "failed",
      mirroredImagePath: null,
      errorMessage: "Image upload failed: Storage unavailable"
    });
  });
});
