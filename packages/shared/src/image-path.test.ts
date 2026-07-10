import { describe, expect, it } from "vitest";

import {
  buildContentAddressedGigImagePath,
  isContentAddressedGigImagePath
} from "./image-path";

const IMAGE_SHA256 =
  "b2e1e2833bd5c8d4f9297f29b8695b5fdd2907c69376710118ad66a6260c5a50";

describe("content-addressed gig image paths", () => {
  it("builds and recognizes a sharded SHA-256 path", () => {
    const path = buildContentAddressedGigImagePath({
      extension: "webp",
      sha256: IMAGE_SHA256
    });

    expect(path).toBe(`sha256/b2/${IMAGE_SHA256}.webp`);
    expect(isContentAddressedGigImagePath(path)).toBe(true);
  });

  it.each([
    "",
    "abc123",
    IMAGE_SHA256.toUpperCase(),
    `${IMAGE_SHA256}0`
  ])("rejects a non-canonical SHA-256 hash: %s", (sha256) => {
    expect(() =>
      buildContentAddressedGigImagePath({
        extension: "jpg",
        sha256
      })
    ).toThrow("64 lowercase hex characters");
  });

  it("rejects unsupported extensions at runtime", () => {
    expect(() =>
      buildContentAddressedGigImagePath({
        extension: "gif" as "jpg",
        sha256: IMAGE_SHA256
      })
    ).toThrow("Unsupported content-addressed image extension: gif");
  });

  it.each([
    `sha256/ff/${IMAGE_SHA256}.webp`,
    `sha256/b2/${IMAGE_SHA256}.gif`,
    `source/event/${IMAGE_SHA256}.webp`,
    "oztix-wa/doctor-jazz/5943d2e0e12f27d05a36af1afca56326645f0dfe.png"
  ])("does not recognize a malformed or legacy path: %s", (path) => {
    expect(isContentAddressedGigImagePath(path)).toBe(false);
  });
});
