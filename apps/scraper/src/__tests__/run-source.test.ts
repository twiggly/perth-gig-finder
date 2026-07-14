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

describe("executeSourceRun persistence", () => {
  it("does not duplicate canonical gigs or source gigs on rerun", async () => {
    const store = new MemoryGigStore();
    const source: SourceAdapter = {
      slug: "milk-bar",
      name: "Milk Bar",
      baseUrl: "https://milkbarperth.com.au/gigs/",
      priority: 100,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [createGig()],
          failedCount: 0
        };
      }
    };

    const firstRun = await executeSourceRun(store, source);
    const secondRun = await executeSourceRun(store, source);

    expect(firstRun.insertedCount).toBe(1);
    expect(secondRun.insertedCount).toBe(0);
    expect(secondRun.updatedCount).toBe(1);
    expect(store.gigs.size).toBe(1);
    expect(store.sourceGigs.size).toBe(1);
    expect(store.imageBucketEnsured).toBe(false);
  });

  it("uses the unchanged source-gig fast path on clean reruns", async () => {
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
              title: "Doctor Jazz",
              status: "active",
              artists: ["Doctor Jazz"]
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, source);
    const existingSourceGig = [...store.sourceGigs.values()][0]!;
    store.findCanonicalGigCalls = 0;
    store.saveGigCalls = 0;
    store.upsertSourceGigCalls = 0;

    const result = await executeSourceRun(store, source);

    expect(result.updatedCount).toBe(1);
    expect(store.findCanonicalGigCalls).toBe(0);
    expect(store.saveGigCalls).toBe(0);
    expect(store.upsertSourceGigCalls).toBe(0);
    expect(store.touchSourceGigsSeenBatches).toEqual([[existingSourceGig.id]]);
    expect(store.syncArtistCallBatches).toHaveLength(1);
  });

  it("falls back to the full write path when an unchanged-checksum source updates public state", async () => {
    const store = new MemoryGigStore();
    let status: GigStatus = "active";
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
              title: "Doctor Jazz",
              status,
              artists: ["Doctor Jazz"]
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, source);
    status = "cancelled";
    store.saveGigCalls = 0;
    store.upsertSourceGigCalls = 0;

    await executeSourceRun(store, source);

    expect(store.saveGigCalls).toBe(1);
    expect(store.upsertSourceGigCalls).toBe(1);
    expect([...store.gigs.values()][0]?.status).toBe("cancelled");
  });

  it("syncs canonical artists once per source run using all touched gig ids", async () => {
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
              title: "Doctor Jazz",
              status: "active",
              artists: ["Doctor Jazz"]
            }),
            createGigForSource({
              sourceSlug: "oztix-wa",
              externalId: "noise-complaints",
              sourceUrl:
                "https://tickets.oztix.com.au/outlet/event/noise-complaints",
              title: "Noise Complaints 1st Bday!",
              status: "active",
              startsAt: "2026-04-11T11:30:00.000Z",
              artists: ["Noise Complaints"]
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, source);

    expect(store.syncArtistCallBatches).toHaveLength(1);
    expect(store.syncArtistCallBatches[0]).toHaveLength(2);
  });

  it("records a partial run when batched canonical artist sync fails after gig writes", async () => {
    const store = new MemoryGigStore();
    store.syncGigArtistsError = "artist sync unavailable";
    const source: SourceAdapter = {
      slug: "milk-bar",
      name: "Milk Bar",
      baseUrl: "https://milkbarperth.com.au/gigs/",
      priority: 100,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [createGig("Doctor Jazz")],
          failedCount: 0
        };
      }
    };

    const result = await executeSourceRun(store, source);

    expect(result.status).toBe("partial");
    expect(result.discoveredCount).toBe(1);
    expect(result.insertedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.errorMessage).toContain("Unable to sync canonical artists");
    expect(store.gigs.size).toBe(1);
  });

  it("reuses one source attachment when the same source emits duplicate listings for one gig", async () => {
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
              externalId: "art-of-dysfunction-a",
              sourceUrl:
                "https://tickets.oztix.com.au/outlet/event/art-of-dysfunction-a",
              title: "Art Of Dysfunction live at Kokomos Freo",
              status: "active",
              venueName: "Kokomo's Livid Skate Cafe",
              venueSuburb: "Fremantle",
              venueAddress: "46 William Street"
            }),
            createGigForSource({
              sourceSlug: "oztix-wa",
              externalId: "art-of-dysfunction-b",
              sourceUrl:
                "https://tickets.oztix.com.au/outlet/event/art-of-dysfunction-b",
              title: "Art Of Dysfunction live at Kokomos Freo",
              status: "active",
              venueName: "Kokomo's Livid Skate Cafe",
              venueSuburb: "Fremantle",
              venueAddress: "46 William Street"
            })
          ],
          failedCount: 0
        };
      }
    };

    const result = await executeSourceRun(store, source);
    const sourceGig = [...store.sourceGigs.values()][0];

    expect(result.insertedCount).toBe(1);
    expect(result.updatedCount).toBe(1);
    expect(store.gigs.size).toBe(1);
    expect(store.sourceGigs.size).toBe(1);
    expect(sourceGig).toMatchObject({
      externalId: "art-of-dysfunction-b",
      gigId: [...store.gigs.values()][0]?.id
    });
  });

  it("prunes duplicate same-source attachments that already exist on the canonical gig", async () => {
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
              externalId: "art-of-dysfunction-a",
              sourceUrl:
                "https://tickets.oztix.com.au/outlet/event/art-of-dysfunction-a",
              title: "Art Of Dysfunction live at Kokomos Freo",
              status: "active",
              venueName: "Kokomo's Livid Skate Cafe",
              venueSuburb: "Fremantle",
              venueAddress: "46 William Street"
            })
          ],
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, source);
    const [sourceRecord] = [...store.sources.values()];
    const [gig] = [...store.gigs.values()];

    const duplicateSourceGigId = randomUUID();
    store.sourceGigs.set(duplicateSourceGigId, {
      id: duplicateSourceGigId,
      gigId: gig!.id,
      sourceId: sourceRecord!.id,
      sourceSlug: "oztix-wa",
      externalId: "art-of-dysfunction-b",
      checksum: "duplicate-checksum",
      identityKey: "art-of-dysfunction-b",
      startsAtPrecision: "exact",
      artistNames: [],
      artistExtractionKind: "unknown",
      sourceUrl: "https://tickets.oztix.com.au/outlet/event/art-of-dysfunction-b",
      sourceImageUrl: null,
      mirroredImagePath: null,
      imageMirrorStatus: "missing",
      imageMirroredAt: null,
      mirroredImageWidth: null,
      mirroredImageHeight: null,
      lastSeenAt: new Date().toISOString()
    });

    expect(store.sourceGigs.size).toBe(2);

    await executeSourceRun(store, source);

    expect(store.gigs.size).toBe(1);
    expect(store.sourceGigs.size).toBe(1);
  });

  it("records a partial run when one listing fails but another succeeds", async () => {
    const store = new MemoryGigStore();
    const source: SourceAdapter = {
      slug: "milk-bar",
      name: "Milk Bar",
      baseUrl: "https://milkbarperth.com.au/gigs/",
      priority: 100,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [createGig("Doctor Jazz")],
          failedCount: 1
        };
      }
    };

    const result = await executeSourceRun(store, source);

    expect(result.status).toBe("partial");
    expect(result.insertedCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(store.gigs.size).toBe(1);
  });

  it("persists cancelled gigs with a non-active status", async () => {
    const store = new MemoryGigStore();
    const source: SourceAdapter = {
      slug: "milk-bar",
      name: "Milk Bar",
      baseUrl: "https://milkbarperth.com.au/gigs/",
      priority: 100,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGig(
              "CANCELLED - Ultimate Fleetwood Mac Experience + Very Best of the Eagles",
              "cancelled"
            )
          ],
          failedCount: 0
        };
      }
    };

    const result = await executeSourceRun(store, source);
    const persistedGig = [...store.gigs.values()][0];

    expect(result.status).toBe("success");
    expect(result.insertedCount).toBe(1);
    expect(persistedGig?.status).toBe("cancelled");
  });

});
