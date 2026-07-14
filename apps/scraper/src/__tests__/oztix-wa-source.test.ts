import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  extractOztixArtists,
  isMusicGigHit,
  isPerthMetroHit,
  normalizeOztixHit,
  oztixWaSource,
  parseOztixDescriptionArtists,
  parseOztixSpecialGuests,
  parseOztixTitleHeadlinerArtists,
  parseOztixHits,
  parseOztixTitleFeaturedArtists,
  parseOztixTitleLineupArtists,
  parseOztixTitlePresentedArtists,
  parseOztixTitleTrailingWithArtists
} from "../sources/oztix-wa";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixtures");


describe("oztix wa source transport", () => {
  it("parses WA hits into normalized gigs, skips non-gig events, and counts failures", () => {
    const fixture = JSON.parse(
      readFileSync(resolve(FIXTURE_DIR, "oztix-wa-hits.json"), "utf8")
    ) as {
      results: Array<{ hits: unknown[] }>;
    };

    const parsed = parseOztixHits(fixture.results[0].hits as never[]);

    expect(parsed.gigs).toHaveLength(3);
    expect(parsed.failedCount).toBe(1);
    expect(parsed.gigs[0]).toMatchObject({
      sourceSlug: "oztix-wa",
      externalId: "3d742027-9b7e-4a45-9fcf-08888b3cbc93",
      title: "Doctor Jazz",
      imageUrl: null,
      status: "active",
      startsAt: "2026-04-07T10:30:00.000Z",
      startsAtPrecision: "exact",
      artists: ["Doctor Jazz"],
      artistExtractionKind: "structured"
    });
    expect(parsed.gigs[1]).toMatchObject({
      title: "TIGHTARSE TUESDAY: TRAFFIC LIGHT PARTY?? ?? ??",
      status: "active"
    });
    expect(parsed.gigs[2]).toMatchObject({
      externalId: "319bc90e-b8b5-4d98-b79f-c3317150658b",
      status: "cancelled"
    });
    expect(parsed.gigs.some((gig) => gig.title === "The Quizzical Mr Jeff")).toBe(false);
    expect(
      parsed.gigs.some(
        (gig) => gig.title === "Sugar Blue Burlesque Fresh Faced Follies Academy Grad Show"
      )
    ).toBe(false);
  });

  it("fetches the public Algolia event index without requiring a browser", async () => {
    const responseBody = readFileSync(
      resolve(FIXTURE_DIR, "oztix-wa-hits.json"),
      "utf8"
    );

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(responseBody, {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );

    const result = await oztixWaSource.fetchListings(fetchMock);

    expect(result.gigs).toHaveLength(3);
    expect(result.failedCount).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
