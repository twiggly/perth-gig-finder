import { describe, expect, it } from "vitest";

import { buildGigDetailSharePayload } from "./gig-detail-share-button";

describe("buildGigDetailSharePayload", () => {
  it("builds a canonical production share payload for a gig", () => {
    expect(
      buildGigDetailSharePayload({
        slug: "four5nine-bar-rosemount-2026-06-14-opm-acoustic-night-2026",
        title: "OPM Acoustic Night 2026"
      })
    ).toEqual({
      text: "Check out OPM Acoustic Night 2026 on Gig Radar.",
      title: "OPM Acoustic Night 2026",
      url: "https://gigradar.com.au/gigs/four5nine-bar-rosemount-2026-06-14-opm-acoustic-night-2026"
    });
  });
});
