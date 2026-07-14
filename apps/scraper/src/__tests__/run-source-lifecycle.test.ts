import { randomUUID } from "node:crypto";

import {
  areCanonicalTitlesCompatible,
  type GigStatus,
  normalizeCanonicalTitleForMatch,
  normalizeTitleForMatch
} from "@perth-gig-finder/shared";
import { describe, expect, it } from "vitest";

import { selectCanonicalArtistNames } from "../artist-utils";
import { executeSourceRun } from "../run-source";
import type { SourceAdapter, SourceRecord } from "../types";
import {
  createGig,
  createGigForSource,
  MemoryGigStore,
  seedDuplicateReattachmentFixture
} from "./helpers/run-source-fixtures";

describe("executeSourceRun lifecycle and metadata", () => {
  it("prunes stale upcoming source attachments after a clean rerun", async () => {
    const store = new MemoryGigStore();
    let gigs = [
      createGigForSource({
        sourceSlug: "moshtix-wa",
        externalId: "doctor-jazz",
        sourceUrl: "https://www.moshtix.com.au/v2/event/doctor-jazz/193078",
        title: "Doctor Jazz",
        status: "active",
        venueName: "Mojos Bar",
        venueSuburb: "North Fremantle",
        venueAddress: "237 Queen Victoria St"
      }),
      createGigForSource({
        sourceSlug: "moshtix-wa",
        externalId: "regional-night",
        sourceUrl: "https://www.moshtix.com.au/v2/event/regional-night/193083",
        title: "Regional Night",
        status: "active",
        startsAt: "2099-07-01T12:00:00.000Z",
        venueName: "Busselton Pavilion",
        venueSuburb: "Busselton",
        venueAddress: "55 Queen St"
      })
    ];
    const source: SourceAdapter = {
      slug: "moshtix-wa",
      name: "Moshtix WA",
      baseUrl: "https://www.moshtix.com.au/v2/search",
      priority: 10,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs,
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, source);
    expect(store.sourceGigs.size).toBe(2);
    expect(store.gigs.size).toBe(2);

    gigs = [gigs[0]];
    await executeSourceRun(store, source);

    expect(store.sourceGigs.size).toBe(1);
    expect(store.gigs.size).toBe(1);
    expect([...store.sourceGigs.values()].map((sourceGig) => sourceGig.identityKey)).toEqual([
      "doctor-jazz"
    ]);
  });

  it("does not prune stale upcoming source attachments after a partial rerun", async () => {
    const store = new MemoryGigStore();
    let gigs = [
      createGigForSource({
        sourceSlug: "moshtix-wa",
        externalId: "doctor-jazz",
        sourceUrl: "https://www.moshtix.com.au/v2/event/doctor-jazz/193078",
        title: "Doctor Jazz",
        status: "active",
        venueName: "Mojos Bar",
        venueSuburb: "North Fremantle",
        venueAddress: "237 Queen Victoria St"
      }),
      createGigForSource({
        sourceSlug: "moshtix-wa",
        externalId: "regional-night",
        sourceUrl: "https://www.moshtix.com.au/v2/event/regional-night/193083",
        title: "Regional Night",
        status: "active",
        startsAt: "2099-07-01T12:00:00.000Z",
        venueName: "Busselton Pavilion",
        venueSuburb: "Busselton",
        venueAddress: "55 Queen St"
      })
    ];
    let failedCount = 0;
    const source: SourceAdapter = {
      slug: "moshtix-wa",
      name: "Moshtix WA",
      baseUrl: "https://www.moshtix.com.au/v2/search",
      priority: 10,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs,
          failedCount
        };
      }
    };

    await executeSourceRun(store, source);
    expect(store.sourceGigs.size).toBe(2);

    gigs = [gigs[0]];
    failedCount = 1;
    const result = await executeSourceRun(store, source);

    expect(result.status).toBe("partial");
    expect(store.sourceGigs.size).toBe(2);
  });

  it("marks source images pending during scrape instead of mirroring inline", async () => {
    const store = new MemoryGigStore();
    const imageUrl = "https://assets.oztix.com.au/image/doctor-jazz.png";
    const source: SourceAdapter = {
      slug: "oztix-wa",
      name: "Oztix WA",
      baseUrl: "https://www.oztix.com.au/search?states%5B0%5D=WA&q=",
      priority: 10,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGigForSource({
              sourceSlug: "oztix-wa",
              externalId: "doctor-jazz",
              sourceUrl: "https://tickets.oztix.com.au/outlet/event/doctor-jazz",
              imageUrl,
              title: "Doctor Jazz",
              status: "active"
            })
          ],
          failedCount: 0
        };
      }
    };

    const result = await executeSourceRun(store, source);
    const sourceGig = [...store.sourceGigs.values()][0];

    expect(result.status).toBe("success");
    expect(result.insertedCount).toBe(1);
    expect(sourceGig?.imageMirrorStatus).toBe("pending");
    expect(sourceGig?.mirroredImagePath).toBeNull();
    expect(store.mirroredImageCalls).toEqual([]);
  });

  it("preserves ready mirror metadata when the stored image URL is already ready", async () => {
    const store = new MemoryGigStore();
    const source: SourceAdapter = {
      slug: "oztix-wa",
      name: "Oztix WA",
      baseUrl: "https://www.oztix.com.au/search?states%5B0%5D=WA&q=",
      priority: 10,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGigForSource({
              sourceSlug: "oztix-wa",
              externalId: "doctor-jazz",
              sourceUrl: "https://tickets.oztix.com.au/outlet/event/doctor-jazz",
              imageUrl: "https://assets.oztix.com.au/image/doctor-jazz.png",
              title: "Doctor Jazz",
              status: "active"
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, source);
    const pendingSourceGig = [...store.sourceGigs.values()][0];

    expect(pendingSourceGig?.imageMirrorStatus).toBe("pending");

    await store.mirrorSourceGigImage(pendingSourceGig!);

    const firstPath = [...store.sourceGigs.values()][0]?.mirroredImagePath;
    await executeSourceRun(store, source);
    const secondSourceGig = [...store.sourceGigs.values()][0];

    expect(store.mirroredImageCalls).toEqual(["https://assets.oztix.com.au/image/doctor-jazz.png"]);
    expect(secondSourceGig?.imageMirrorStatus).toBe("ready");
    expect(secondSourceGig?.mirroredImagePath).toBe(firstPath);
  });

  it("marks an existing ready mirror pending again when the source image URL changes", async () => {
    const store = new MemoryGigStore();
    let imageUrl = "https://assets.oztix.com.au/image/doctor-jazz-v1.png";
    const source: SourceAdapter = {
      slug: "oztix-wa",
      name: "Oztix WA",
      baseUrl: "https://www.oztix.com.au/search?states%5B0%5D=WA&q=",
      priority: 10,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGigForSource({
              sourceSlug: "oztix-wa",
              externalId: "doctor-jazz",
              sourceUrl: "https://tickets.oztix.com.au/outlet/event/doctor-jazz",
              imageUrl,
              title: "Doctor Jazz",
              status: "active"
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, source);
    await store.mirrorSourceGigImage([...store.sourceGigs.values()][0]!);
    const firstPath = [...store.sourceGigs.values()][0]?.mirroredImagePath;
    imageUrl = "https://assets.oztix.com.au/image/doctor-jazz-v2.png";
    await executeSourceRun(store, source);
    const sourceGig = [...store.sourceGigs.values()][0];

    expect(store.mirroredImageCalls).toEqual(["https://assets.oztix.com.au/image/doctor-jazz-v1.png"]);
    expect(firstPath).not.toBeNull();
    expect(sourceGig?.sourceImageUrl).toBe("https://assets.oztix.com.au/image/doctor-jazz-v2.png");
    expect(sourceGig?.imageMirrorStatus).toBe("pending");
    expect(sourceGig?.mirroredImagePath).toBeNull();
  });

  it("dedupes repeated artist names by slug before storing joins", async () => {
    const store = new MemoryGigStore();
    const source: SourceAdapter = {
      slug: "oztix-wa",
      name: "Oztix WA",
      baseUrl: "https://www.oztix.com.au/search?states%5B0%5D=WA&q=",
      priority: 10,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGigForSource({
              sourceSlug: "oztix-wa",
              externalId: "artist-dedupe-gig",
              sourceUrl: "https://tickets.oztix.com.au/outlet/event/artist-dedupe-gig",
              title: "DJ HMC",
              status: "active",
              artists: ["DJ HMC", "dj hmc ", "Dj Hmc"]
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, source);

    expect(store.artists.size).toBe(1);
    expect([...store.gigArtists.values()][0]).toEqual(["DJ HMC"]);
  });

  it("does not let an unknown artist source overwrite better canonical artists", async () => {
    const store = new MemoryGigStore();
    const primarySource: SourceAdapter = {
      slug: "the-bird",
      name: "The Bird",
      baseUrl: "https://www.williamstreetbird.com/comingup",
      priority: 50,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGigForSource({
              sourceSlug: "the-bird",
              externalId: "class-of-orb",
              sourceUrl: "https://www.williamstreetbird.com/comingup#class-of-orb",
              title: "Class of Orb : Reunion",
              status: "active",
              venueName: "The Bird",
              venueSuburb: "Northbridge",
              venueAddress: "181 William Street",
              artists: ["Class of Orb"],
              artistExtractionKind: "explicit_lineup"
            })
          ],
          failedCount: 0
        };
      }
    };
    const weakerSource: SourceAdapter = {
      slug: "ticketek-wa",
      name: "Ticketek WA",
      baseUrl: "https://premier.ticketek.com.au/",
      priority: 10,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGigForSource({
              sourceSlug: "ticketek-wa",
              externalId: "class-of-orb-ticketek",
              sourceUrl: "https://premier.ticketek.com.au/Shows/Show.aspx?sh=CLASSORB26",
              title: "Class of Orb : Reunion",
              status: "active",
              venueName: "The Bird",
              venueSuburb: "Northbridge",
              venueAddress: "181 William Street",
              artists: [],
              artistExtractionKind: "unknown"
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, primarySource);
    await executeSourceRun(store, weakerSource);

    expect([...store.gigArtists.values()][0]).toEqual(["Class of Orb"]);
  });

  it("keeps canonical artists empty when every attached source is unknown", async () => {
    const store = new MemoryGigStore();
    const source: SourceAdapter = {
      slug: "ticketek-wa",
      name: "Ticketek WA",
      baseUrl: "https://premier.ticketek.com.au/",
      priority: 10,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGigForSource({
              sourceSlug: "ticketek-wa",
              externalId: "bootleg-beatles",
              sourceUrl: "https://premier.ticketek.com.au/Shows/Show.aspx?sh=BOOTLEGB26",
              title: "Bootleg Beatles",
              status: "active",
              artists: [],
              artistExtractionKind: "unknown"
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, source);

    expect([...store.gigArtists.values()][0]).toEqual([]);
  });

  it("chooses canonical artists by extraction kind, then priority, then artist count, then recency", () => {
    expect(
      selectCanonicalArtistNames([
        {
          artists: ["Later Structured"],
          artistExtractionKind: "structured",
          priority: 10,
          lastSeenAt: "2026-04-21T10:00:00.000Z"
        },
        {
          artists: ["Headline Artist", "Support Artist"],
          artistExtractionKind: "explicit_lineup",
          priority: 100,
          lastSeenAt: "2026-04-21T11:00:00.000Z"
        }
      ])
    ).toEqual(["Later Structured"]);

    expect(
      selectCanonicalArtistNames([
        {
          artists: ["Low Priority Artist"],
          artistExtractionKind: "parsed_text",
          priority: 10,
          lastSeenAt: "2026-04-21T10:00:00.000Z"
        },
        {
          artists: ["High Priority Artist"],
          artistExtractionKind: "parsed_text",
          priority: 50,
          lastSeenAt: "2026-04-21T09:00:00.000Z"
        }
      ])
    ).toEqual(["High Priority Artist"]);

    expect(
      selectCanonicalArtistNames([
        {
          artists: ["Solo Artist"],
          artistExtractionKind: "parsed_text",
          priority: 10,
          lastSeenAt: "2026-04-21T10:00:00.000Z"
        },
        {
          artists: ["Artist One", "Artist Two"],
          artistExtractionKind: "parsed_text",
          priority: 10,
          lastSeenAt: "2026-04-21T09:00:00.000Z"
        }
      ])
    ).toEqual(["Artist One", "Artist Two"]);

    expect(
      selectCanonicalArtistNames([
        {
          artists: ["Earlier Artist"],
          artistExtractionKind: "parsed_text",
          priority: 10,
          lastSeenAt: "2026-04-21T09:00:00.000Z"
        },
        {
          artists: ["Later Artist"],
          artistExtractionKind: "parsed_text",
          priority: 10,
          lastSeenAt: "2026-04-21T10:00:00.000Z"
        }
      ])
    ).toEqual(["Later Artist"]);
  });
});
