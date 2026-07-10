import { describe, expect, it } from "vitest";
import { hasLocalMatch } from "next/dist/shared/lib/match-local-pattern";
import { matchRemotePattern } from "next/dist/shared/lib/match-remote-pattern";

import nextConfig, { getImageSourcePolicy } from "./next.config";

function matchesRemoteImage(
  policy: ReturnType<typeof getImageSourcePolicy>,
  value: string
): boolean {
  const url = new URL(value);
  return policy.remotePatterns.some((pattern) =>
    matchRemotePattern(pattern, url)
  );
}

describe("Next image configuration", () => {
  it("caps responsive device widths without changing card image widths", () => {
    expect(nextConfig.images?.deviceSizes).toEqual([
      640,
      750,
      828,
      1080,
      1200,
      1440
    ]);
    expect(Math.max(...(nextConfig.images?.deviceSizes ?? []))).toBe(1440);
    expect(nextConfig.images?.imageSizes).toEqual([
      88,
      115,
      168,
      176,
      230,
      336
    ]);
    expect(nextConfig.images?.qualities).toEqual([72]);
  });

  it("only optimizes query-free local venue placeholders", () => {
    const localPatterns = nextConfig.images?.localPatterns;

    expect(localPatterns).toEqual([
      {
        pathname: "/venue-placeholders/**",
        search: ""
      }
    ]);
    expect(
      hasLocalMatch(localPatterns, "/venue-placeholders/the-bird.png")
    ).toBe(true);
    expect(
      hasLocalMatch(localPatterns, "/venue-placeholders/the-bird.png?v=2")
    ).toBe(false);
    expect(hasLocalMatch(localPatterns, "/logo.png")).toBe(false);
  });

  it("restricts Oztix images to query-free image paths", () => {
    const policy = getImageSourcePolicy();

    expect(policy.dangerouslyAllowLocalIP).toBe(false);
    expect(
      matchesRemoteImage(
        policy,
        "https://assets.oztix.com.au/image/gig.png"
      )
    ).toBe(true);
    expect(
      matchesRemoteImage(
        policy,
        "https://assets.oztix.com.au/image/gig.png?width=600"
      )
    ).toBe(false);
    expect(
      matchesRemoteImage(policy, "https://assets.oztix.com.au/gig.png")
    ).toBe(false);
    expect(
      matchesRemoteImage(
        policy,
        "http://assets.oztix.com.au/image/gig.png"
      )
    ).toBe(false);
  });

  it("allows only the configured hosted Supabase image origin and bucket", () => {
    const policy = getImageSourcePolicy("https://project.supabase.co");

    expect(policy.dangerouslyAllowLocalIP).toBe(false);
    expect(
      matchesRemoteImage(
        policy,
        "https://project.supabase.co/storage/v1/object/public/gig-images/posters/gig.jpg?v=4"
      )
    ).toBe(true);
    expect(
      matchesRemoteImage(
        policy,
        "https://project.supabase.co/storage/v1/object/public/other-bucket/gig.jpg"
      )
    ).toBe(false);
    expect(
      matchesRemoteImage(
        policy,
        "https://other.supabase.co/storage/v1/object/public/gig-images/gig.jpg"
      )
    ).toBe(false);
  });

  it.each([
    "http://127.0.0.1:55321",
    "http://localhost:55321",
    "http://[::1]:55321"
  ])("allows an explicitly configured loopback Supabase origin: %s", (url) => {
    const policy = getImageSourcePolicy(url);
    const imageUrl = `${url}/storage/v1/object/public/gig-images/gig.jpg?v=1`;

    expect(policy.dangerouslyAllowLocalIP).toBe(true);
    expect(matchesRemoteImage(policy, imageUrl)).toBe(true);
  });

  it.each([undefined, "not a URL", "ftp://project.supabase.co"])(
    "does not broaden the allowlist for an invalid Supabase URL: %s",
    (url) => {
      const policy = getImageSourcePolicy(url);

      expect(policy.dangerouslyAllowLocalIP).toBe(false);
      expect(policy.remotePatterns).toEqual([
        {
          protocol: "https",
          hostname: "assets.oztix.com.au",
          port: "",
          pathname: "/image/**",
          search: ""
        }
      ]);
    }
  );

  it("does not enable private-IP optimization for non-loopback hosts", () => {
    const policy = getImageSourcePolicy("http://192.168.1.10:55321");

    expect(policy.dangerouslyAllowLocalIP).toBe(false);
  });
});
