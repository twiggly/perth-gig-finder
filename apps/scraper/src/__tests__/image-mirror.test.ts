import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import {
  buildMirroredImagePath,
  mirrorSourceImage
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

  it("rejects oversized images before upload", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response("too-big", {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": String(9 * 1024 * 1024)
        }
      })
    );

    const result = await mirrorSourceImage({
      sourceGig: createSourceGig(),
      fetchImpl: fetchMock,
      upload
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("8 MB");
    expect(upload).not.toHaveBeenCalled();
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
      expect.any(Buffer),
      { contentType: "image/png" }
    );
  });
});
