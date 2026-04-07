import { describe, expect, it } from "vitest";

import {
  buildGigChecksum,
  buildGigSlug,
  normalizeTitleForMatch,
  slugify
} from "./index";

describe("normalization helpers", () => {
  it("creates stable slugs", () => {
    expect(slugify("Milk Bar Presents: TIME!!!")).toBe("milk-bar-presents-time");
    expect(
      buildGigSlug({
        venueSlug: "milk-bar",
        startsAt: "2026-04-10T11:30:00.000Z",
        title: "TIME"
      })
    ).toBe("milk-bar-2026-04-10-time");
  });

  it("normalizes titles for canonical matching", () => {
    expect(normalizeTitleForMatch("TIME  ")).toBe("time");
    expect(normalizeTitleForMatch("Time")).toBe("time");
  });

  it("builds deterministic gig checksums", () => {
    const input = {
      sourceSlug: "milk-bar",
      startsAt: "2026-04-10T11:30:00.000Z",
      title: "TIME",
      venueSlug: "milk-bar",
      sourceUrl:
        "https://tickets.avclive.com.au/outlet/event/f4fbba8d-7582-40fb-b5e5-4f0aedab965f"
    };

    expect(buildGigChecksum(input)).toBe(buildGigChecksum(input));
  });
});

