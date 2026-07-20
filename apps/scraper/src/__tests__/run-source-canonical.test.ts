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

describe("executeSourceRun canonical matching", () => {
  it("reuses the canonical gig when the same event arrives from two sources", async () => {
    const store = new MemoryGigStore();
    const aggregatorSource: SourceAdapter = {
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
              externalId: "319bc90e-b8b5-4d98-b79f-c3317150658b",
              sourceUrl:
                "https://tickets.oztix.com.au/outlet/event/319bc90e-b8b5-4d98-b79f-c3317150658b",
              title: "Ultimate Fleetwood Mac Experience + Very Best of the Eagles",
              status: "active"
            })
          ],
          failedCount: 0
        };
      }
    };
    const venueSource: SourceAdapter = {
      slug: "milk-bar",
      name: "Milk Bar",
      baseUrl: "https://milkbarperth.com.au/gigs/",
      priority: 100,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGigForSource({
              sourceSlug: "milk-bar",
              externalId: "f4fbba8d-7582-40fb-b5e5-4f0aedab965f",
              sourceUrl:
                "https://tickets.avclive.com.au/outlet/event/f4fbba8d-7582-40fb-b5e5-4f0aedab965f",
              title: "Ultimate Fleetwood Mac Experience + Very Best of the Eagles",
              status: "active"
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, aggregatorSource);
    await executeSourceRun(store, venueSource);

    expect(store.gigs.size).toBe(1);
    expect(store.sourceGigs.size).toBe(2);
  });

  it("reuses the canonical gig when venue names differ only by apostrophe punctuation", async () => {
    const store = new MemoryGigStore();
    const oztixSource: SourceAdapter = {
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
              externalId: "sophie-oztix",
              sourceUrl: "https://tickets.oztix.com.au/outlet/event/sophie-oztix",
              title: "Sophie Lilah ‘Busy Being in Love’ Album Launch",
              status: "active",
              imageUrl: "https://assets.oztix.com.au/image/sophie.png",
              venueName: "Mojo's Bar",
              venueSuburb: "North Fremantle",
              venueAddress: "237 Queen Victoria St",
              venueWebsiteUrl: "https://www.mojosbar.com.au"
            })
          ],
          failedCount: 0
        };
      }
    };
    const moshtixSource: SourceAdapter = {
      slug: "moshtix-wa",
      name: "Moshtix WA",
      baseUrl: "https://www.moshtix.com.au/v2/search",
      priority: 10,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGigForSource({
              sourceSlug: "moshtix-wa",
              externalId: "sophie-moshtix",
              sourceUrl: "https://www.moshtix.com.au/v2/event/sophie-lilah/192946",
              title: "Sophie Lilah 'Busy Being in Love' Album Launch",
              status: "active",
              imageUrl: "https://static.moshtix.com.au/uploads/sophie-square.jpg",
              venueName: "Mojos Bar",
              venueSuburb: "North Fremantle",
              venueAddress: "237 Queen Victoria St",
              venueWebsiteUrl: "https://www.mojosbar.com.au"
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, oztixSource);
    await executeSourceRun(store, moshtixSource);

    expect(store.venues.size).toBe(1);
    expect(store.gigs.size).toBe(1);
    expect(store.sourceGigs.size).toBe(2);
  });

  it("upgrades a date-only fallback to an exact start time on the same Perth day", async () => {
    const store = new MemoryGigStore();
    const ticketekSource: SourceAdapter = {
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
              externalId: "bootleg-ticketek",
              sourceUrl: "https://premier.ticketek.com.au/Shows/Show.aspx?sh=BOOTLEGB26",
              title: "Bootleg Beatles In Concert",
              status: "active",
              startsAt: "2026-11-07T04:00:00.000Z",
              startsAtPrecision: "date",
              venueName: "Riverside Theatre, Perth Convention and Exhibition Centre",
              venueSuburb: "Perth",
              venueAddress: "21 Mounts Bay Rd"
            })
          ],
          failedCount: 0
        };
      }
    };
    const oztixSource: SourceAdapter = {
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
              externalId: "bootleg-oztix",
              sourceUrl: "https://tickets.oztix.com.au/outlet/event/bootleg-oztix",
              title: "Bootleg Beatles",
              status: "active",
              startsAt: "2026-11-07T11:30:00.000Z",
              startsAtPrecision: "exact",
              venueName: "Riverside Theatre, Perth Convention and Exhibition Centre",
              venueSuburb: "Perth",
              venueAddress: "21 Mounts Bay Rd"
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, ticketekSource);
    await executeSourceRun(store, oztixSource);

    expect(store.gigs.size).toBe(1);
    expect([...store.gigs.values()][0]).toMatchObject({
      title: "Bootleg Beatles In Concert",
      startsAt: "2026-11-07T11:30:00.000Z",
      startsAtPrecision: "exact"
    });
  });

  it("lets a higher-priority source take canonical ownership", async () => {
    const store = new MemoryGigStore();
    const oztixSource: SourceAdapter = {
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
              externalId: "doctor-jazz-oztix",
              sourceUrl: "https://tickets.oztix.com.au/outlet/event/doctor-jazz-oztix",
              title: "Doctor Jazz Live",
              status: "active"
            })
          ],
          failedCount: 0
        };
      }
    };
    const milkBarSource: SourceAdapter = {
      slug: "milk-bar",
      name: "Milk Bar",
      baseUrl: "https://milkbarperth.com.au/gigs/",
      priority: 100,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGigForSource({
              sourceSlug: "milk-bar",
              externalId: "doctor-jazz-milkbar",
              sourceUrl:
                "https://tickets.avclive.com.au/outlet/event/doctor-jazz-milkbar",
              title: "Doctor Jazz",
              status: "cancelled"
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, oztixSource);
    await executeSourceRun(store, milkBarSource);

    expect(store.gigs.size).toBe(1);
    expect([...store.gigs.values()][0]).toMatchObject({
      title: "Doctor Jazz",
      sourceUrl: "https://tickets.avclive.com.au/outlet/event/doctor-jazz-milkbar",
      status: "cancelled"
    });
  });

  it("preserves the first public slug when canonical gig facts change", async () => {
    const store = new MemoryGigStore();
    let gig = createGigForSource({
      externalId: "stable-url-event",
      sourceSlug: "oztix-wa",
      sourceUrl: "https://tickets.oztix.com.au/outlet/event/stable-url-event",
      startsAt: "2026-08-01T11:00:00.000Z",
      status: "active",
      title: "Original Event Title",
      venueName: "Milk Bar"
    });
    const source: SourceAdapter = {
      baseUrl: "https://www.oztix.com.au/",
      isPublicListingSource: true,
      name: "Oztix WA",
      priority: 10,
      slug: "oztix-wa",
      async fetchListings() {
        return { failedCount: 0, gigs: [gig] };
      }
    };

    await executeSourceRun(store, source);
    const initialSlug = [...store.gigs.values()][0]?.slug;

    gig = createGigForSource({
      externalId: "stable-url-event",
      sourceSlug: "oztix-wa",
      sourceUrl: "https://tickets.oztix.com.au/outlet/event/stable-url-event",
      startsAt: "2026-08-08T11:00:00.000Z",
      status: "postponed",
      title: "Updated Event Title",
      venueName: "The Bird"
    });
    await executeSourceRun(store, source);

    expect(initialSlug).toBeTruthy();
    expect([...store.gigs.values()][0]).toMatchObject({
      slug: initialSlug,
      startsAt: "2026-08-08T11:00:00.000Z",
      status: "postponed",
      title: "Updated Event Title"
    });

    store.saveGigCalls = 0;
    store.upsertSourceGigCalls = 0;
    await executeSourceRun(store, source);

    expect(store.saveGigCalls).toBe(0);
    expect(store.upsertSourceGigCalls).toBe(0);
  });

  it("keeps canonical fields stable when an equal-priority source matches later", async () => {
    const store = new MemoryGigStore();
    const oztixSource: SourceAdapter = {
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
              externalId: "sophie-oztix",
              sourceUrl: "https://tickets.oztix.com.au/outlet/event/sophie-oztix",
              title: "Sophie Lilah ‘Busy Being in Love’ Album Launch",
              status: "active",
              venueName: "Mojo's Bar",
              venueSuburb: "North Fremantle",
              venueAddress: "237 Queen Victoria St",
              venueWebsiteUrl: "https://www.mojosbar.com.au"
            })
          ],
          failedCount: 0
        };
      }
    };
    const moshtixSource: SourceAdapter = {
      slug: "moshtix-wa",
      name: "Moshtix WA",
      baseUrl: "https://www.moshtix.com.au/v2/search",
      priority: 10,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGigForSource({
              sourceSlug: "moshtix-wa",
              externalId: "sophie-moshtix",
              sourceUrl: "https://www.moshtix.com.au/v2/event/sophie-lilah/192946",
              title: "Sophie Lilah Busy Being in Love",
              status: "cancelled",
              venueName: "Mojos Bar",
              venueSuburb: "North Fremantle",
              venueAddress: "237 Queen Victoria St",
              venueWebsiteUrl: "https://www.mojosbar.com.au"
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, oztixSource);
    await executeSourceRun(store, moshtixSource);

    expect(store.gigs.size).toBe(1);
    expect([...store.gigs.values()][0]).toMatchObject({
      title: "Sophie Lilah ‘Busy Being in Love’ Album Launch",
      sourceUrl: "https://tickets.oztix.com.au/outlet/event/sophie-oztix",
      status: "active"
    });
  });

  it("keeps same-night similar titles separate when they are not a strong canonical match", async () => {
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
              externalId: "late-show",
              sourceUrl: "https://tickets.oztix.com.au/outlet/event/late-show",
              title: "Late Show",
              status: "active",
              venueName: "Rosemount Hotel",
              venueSuburb: "North Perth",
              venueAddress: "459 Fitzgerald St"
            }),
            createGigForSource({
              sourceSlug: "oztix-wa",
              externalId: "rosemount-late-show",
              sourceUrl:
                "https://tickets.oztix.com.au/outlet/event/rosemount-late-show",
              title: "Rosemount Late Show",
              status: "active",
              venueName: "Rosemount Hotel",
              venueSuburb: "North Perth",
              venueAddress: "459 Fitzgerald St"
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, source);

    expect(store.gigs.size).toBe(2);
  });

  it("reattaches an existing source gig when a better canonical match appears on rerun", async () => {
    const store = new MemoryGigStore();
    const venue = {
      id: randomUUID(),
      slug: "the-bird",
      name: "The Bird"
    };
    store.venues.set(venue.slug, venue);

    const oztix = {
      id: randomUUID(),
      slug: "oztix-wa",
      name: "Oztix WA",
      baseUrl: "https://www.oztix.com.au/search?states%5B0%5D=WA&q=",
      priority: 10,
      isPublicListingSource: true
    } satisfies SourceRecord;
    const bird = {
      id: randomUUID(),
      slug: "the-bird",
      name: "The Bird",
      baseUrl: "https://www.williamstreetbird.com/comingup",
      priority: 50,
      isPublicListingSource: true
    } satisfies SourceRecord;
    store.sources.set(oztix.slug, oztix);
    store.sources.set(bird.slug, bird);

    const existingGigId = randomUUID();
    const duplicateGigId = randomUUID();
    const startsAt = "2026-04-25T08:00:00.000Z";

    store.gigs.set(existingGigId, {
      id: existingGigId,
      slug: "the-bird-2026-04-25-sweet-16-carpark-party",
      title: "Sweet 16 Carpark Party",
      venueId: venue.id,
      startsAt,
      startsAtPrecision: "exact",
      status: "active",
      normalizedTitle: normalizeTitleForMatch("Sweet 16 Carpark Party"),
      canonicalTitle: normalizeCanonicalTitleForMatch("Sweet 16 Carpark Party"),
      sourceUrl: "https://tickets.oztix.com.au/outlet/event/sweet-16-carpark-party",
      description: null,
      ticketUrl: "https://tickets.oztix.com.au/outlet/event/sweet-16-carpark-party"
    });
    store.gigs.set(duplicateGigId, {
      id: duplicateGigId,
      slug: "the-bird-2026-04-25-the-bird-sweet-16th-carpark-birthday-party",
      title: "THE BIRD SWEET 16th CARPARK BIRTHDAY PARTY",
      venueId: venue.id,
      startsAt,
      startsAtPrecision: "exact",
      status: "active",
      normalizedTitle: normalizeTitleForMatch("THE BIRD SWEET 16th CARPARK BIRTHDAY PARTY"),
      canonicalTitle: normalizeCanonicalTitleForMatch(
        "THE BIRD SWEET 16th CARPARK BIRTHDAY PARTY"
      ),
      sourceUrl:
        "https://www.williamstreetbird.com/comingup#2026-04-25-the-bird-sweet-16th-carpark-birthday-party",
      description: null,
      ticketUrl: null
    });
    store.sourceGigs.set(randomUUID(), {
      id: randomUUID(),
      gigId: existingGigId,
      sourceSlug: "oztix-wa",
      sourceId: oztix.id,
      identityKey: "sweet-16-oztix",
      externalId: "sweet-16-oztix",
      checksum: "sweet-16-oztix-checksum",
      sourceUrl: "https://tickets.oztix.com.au/outlet/event/sweet-16-carpark-party",
      startsAtPrecision: "exact",
      artistNames: [],
      artistExtractionKind: "unknown",
      sourceImageUrl: "https://assets.oztix.com.au/image/sweet-16.png",
      mirroredImagePath: "oztix-wa/sweet-16.webp",
      imageMirrorStatus: "ready",
      imageMirroredAt: new Date().toISOString(),
      mirroredImageWidth: 1200,
      mirroredImageHeight: 800,
      lastSeenAt: new Date().toISOString()
    });
    const birdSourceGigId = randomUUID();
    store.sourceGigs.set(birdSourceGigId, {
      id: birdSourceGigId,
      gigId: duplicateGigId,
      sourceSlug: "the-bird",
      sourceId: bird.id,
      identityKey: "2026-04-25-the-bird-sweet-16th-carpark-birthday-party",
      externalId: "2026-04-25-the-bird-sweet-16th-carpark-birthday-party",
      checksum: "sweet-16-bird-checksum",
      sourceUrl:
        "https://www.williamstreetbird.com/comingup#2026-04-25-the-bird-sweet-16th-carpark-birthday-party",
      startsAtPrecision: "exact",
      artistNames: [],
      artistExtractionKind: "unknown",
      sourceImageUrl: null,
      mirroredImagePath: null,
      imageMirrorStatus: "missing",
      imageMirroredAt: null,
      mirroredImageWidth: null,
      mirroredImageHeight: null,
      lastSeenAt: new Date().toISOString()
    });

    const source: SourceAdapter = {
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
              externalId: "2026-04-25-the-bird-sweet-16th-carpark-birthday-party",
              sourceUrl:
                "https://www.williamstreetbird.com/comingup#2026-04-25-the-bird-sweet-16th-carpark-birthday-party",
              title: "THE BIRD SWEET 16th CARPARK BIRTHDAY PARTY",
              status: "active",
              startsAt,
              venueName: "The Bird",
              venueSuburb: "Northbridge",
              venueAddress: "181 William Street"
            })
          ],
          failedCount: 0
        };
      }
    };

    expect(
      areCanonicalTitlesCompatible(
        "THE BIRD SWEET 16th CARPARK BIRTHDAY PARTY",
        "Sweet 16 Carpark Party"
      )
    ).toBe(true);
    await expect(
      store.findSourceGig(
        bird.id,
        "2026-04-25-the-bird-sweet-16th-carpark-birthday-party",
        "sweet-16-bird-checksum"
      )
    ).resolves.toMatchObject({ gigId: duplicateGigId });
    await expect(
      store.findCanonicalGig({
        venueId: venue.id,
        startsAt,
        title: "THE BIRD SWEET 16th CARPARK BIRTHDAY PARTY",
        excludeGigId: duplicateGigId
      })
    ).resolves.toMatchObject({ id: existingGigId });

    await executeSourceRun(store, source);

    const attachedGigIds = new Set([...store.sourceGigs.values()].map((sourceGig) => sourceGig.gigId));

    expect(attachedGigIds.size).toBe(1);
    expect(store.gigs.size).toBe(1);
    expect(
      [...store.sourceGigs.values()].map((sourceGig) => sourceGig.sourceSlug).sort()
    ).toEqual(["oztix-wa", "the-bird"]);
  });

  it("reattaches stale duplicates with ticket-status and festival title noise", async () => {
    const cases = [
      {
        canonicalTitle: "Cosmic Jive!",
        duplicateTitle: "Cosmic Jive! SOLD OUT",
        sourceSlug: "milk-bar",
        sourceName: "Milk Bar",
        sourceBaseUrl: "https://milkbarperth.com.au/gigs/",
        venueName: "Milk Bar",
        startsAt: "2026-07-19T05:30:00.000Z"
      },
      {
        canonicalTitle: "BLOOM",
        duplicateTitle: "BLOOM FESTIVAL 2026",
        sourceSlug: "the-bird",
        sourceName: "The Bird",
        sourceBaseUrl: "https://www.williamstreetbird.com/comingup",
        venueName: "The Bird",
        startsAt: "2026-06-27T10:00:00.000Z"
      }
    ];

    for (const testCase of cases) {
      const { store, source, existingGigId } = seedDuplicateReattachmentFixture(testCase);

      expect(
        areCanonicalTitlesCompatible(testCase.canonicalTitle, testCase.duplicateTitle)
      ).toBe(true);

      await executeSourceRun(store, source);

      const attachedGigIds = new Set(
        [...store.sourceGigs.values()].map((sourceGig) => sourceGig.gigId)
      );

      expect(attachedGigIds).toEqual(new Set([existingGigId]));
      expect(store.gigs.size).toBe(1);
      expect(
        [...store.sourceGigs.values()].map((sourceGig) => sourceGig.sourceSlug).sort()
      ).toEqual(["canonical-source", testCase.sourceSlug].sort());
    }
  });

});
