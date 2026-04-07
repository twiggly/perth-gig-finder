import { randomUUID } from "node:crypto";

import {
  buildGigChecksum,
  type GigStatus,
  normalizeTitleForMatch,
  slugify,
  type NormalizedGig
} from "@perth-gig-finder/shared";
import { describe, expect, it } from "vitest";

import { buildMirroredImagePath, shouldMirrorImage } from "../image-mirror";
import { executeSourceRun } from "../run-source";
import type {
  GigRecord,
  GigStore,
  SourceGigImageMirrorResult,
  SourceAdapter,
  SourceGigRecord,
  SourceRecord,
  VenueRecord
} from "../types";

class MemoryGigStore implements GigStore {
  readonly sources = new Map<string, SourceRecord>();
  readonly scrapeRuns = new Map<
    string,
    {
      sourceId: string;
      status: string;
      discoveredCount: number;
      insertedCount: number;
      updatedCount: number;
      failedCount: number;
    }
  >();
  readonly venues = new Map<string, VenueRecord & { name: string }>();
  readonly gigs = new Map<
    string,
    GigRecord & {
      venueId: string;
      startsAt: string;
      status: GigStatus;
      normalizedTitle: string;
      sourceUrl: string;
      description: string | null;
      ticketUrl: string | null;
    }
  >();
  readonly sourceGigs = new Map<
    string,
    SourceGigRecord & { sourceId: string; externalId: string | null; checksum: string }
  >();
  readonly artists = new Map<string, string>();
  readonly gigArtists = new Map<string, string[]>();
  readonly mirroredImagePaths = new Map<string, string>();
  readonly mirroredImageCalls: string[] = [];
  readonly failingImageUrls = new Set<string>();
  imageBucketEnsured = false;

  async ensureSource(input: {
    slug: string;
    name: string;
    baseUrl: string;
    priority: number;
  }): Promise<SourceRecord> {
    const existing = this.sources.get(input.slug);

    if (existing) {
      return existing;
    }

    const source = { id: randomUUID(), ...input };
    this.sources.set(input.slug, source);
    return source;
  }

  async ensureImageBucket(): Promise<void> {
    this.imageBucketEnsured = true;
  }

  async startScrapeRun(sourceId: string, _startedAt: string): Promise<string> {
    const id = randomUUID();
    this.scrapeRuns.set(id, {
      sourceId,
      status: "running",
      discoveredCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      failedCount: 0
    });
    return id;
  }

  async finishScrapeRun(
    runId: string,
    result: {
      status: "success" | "partial" | "failed" | "running";
      discoveredCount: number;
      insertedCount: number;
      updatedCount: number;
      failedCount: number;
      errorMessage: string | null;
      finishedAt: string;
    }
  ): Promise<void> {
    const existing = this.scrapeRuns.get(runId);

    if (!existing) {
      throw new Error("scrape run missing");
    }

    this.scrapeRuns.set(runId, {
      ...existing,
      status: result.status,
      discoveredCount: result.discoveredCount,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      failedCount: result.failedCount
    });
  }

  async upsertVenue(gig: NormalizedGig): Promise<VenueRecord> {
    const existing = this.venues.get(gig.venue.slug);

    if (existing) {
      return existing;
    }

    const venue = {
      id: randomUUID(),
      slug: gig.venue.slug,
      name: gig.venue.name
    };
    this.venues.set(venue.slug, venue);
    return venue;
  }

  async findSourceGig(
    sourceId: string,
    externalId: string | null,
    checksum: string
  ): Promise<SourceGigRecord | null> {
    for (const sourceGig of this.sourceGigs.values()) {
      const matchesExternal = externalId
        ? sourceGig.sourceId === sourceId && sourceGig.externalId === externalId
        : sourceGig.sourceId === sourceId && sourceGig.checksum === checksum;

      if (matchesExternal) {
        return sourceGig;
      }
    }

    return null;
  }

  async findCanonicalGig(
    venueId: string,
    startsAt: string,
    normalizedTitle: string
  ): Promise<GigRecord | null> {
    for (const gig of this.gigs.values()) {
      if (
        gig.venueId === venueId &&
        gig.startsAt === startsAt &&
        gig.normalizedTitle === normalizedTitle
      ) {
        return gig;
      }
    }

    return null;
  }

  async saveGig(input: {
    existingGigId: string | null;
    gig: NormalizedGig;
    venueId: string;
  }): Promise<{ gig: GigRecord; inserted: boolean }> {
    if (input.existingGigId) {
      const existing = this.gigs.get(input.existingGigId);

      if (!existing) {
        throw new Error("existing gig not found");
      }

      const updated = {
        ...existing,
        venueId: input.venueId,
        startsAt: input.gig.startsAt,
        status: input.gig.status,
        normalizedTitle: normalizeTitleForMatch(input.gig.title),
        description: input.gig.description,
        ticketUrl: input.gig.ticketUrl,
        sourceUrl: input.gig.sourceUrl,
        title: input.gig.title
      };
      this.gigs.set(existing.id, updated);
      return { gig: updated, inserted: false };
    }

    const gig = {
      id: randomUUID(),
      slug: slugify(`${input.gig.venue.slug}-${input.gig.title}`),
      title: input.gig.title,
      venueId: input.venueId,
      startsAt: input.gig.startsAt,
      status: input.gig.status,
      normalizedTitle: normalizeTitleForMatch(input.gig.title),
      description: input.gig.description,
      ticketUrl: input.gig.ticketUrl,
      sourceUrl: input.gig.sourceUrl
    };
    this.gigs.set(gig.id, gig);
    return { gig, inserted: true };
  }

  async upsertSourceGig(input: {
    sourceId: string;
    gigId: string;
    gig: NormalizedGig;
  }): Promise<{
    inserted: boolean;
    sourceGig: SourceGigRecord;
    shouldMirror: boolean;
  }> {
    const existing = await this.findSourceGig(
      input.sourceId,
      input.gig.externalId,
      input.gig.checksum
    );

    const sourceImageUrl = input.gig.imageUrl;
    const unchangedReadyImage =
      Boolean(sourceImageUrl) &&
      existing?.sourceImageUrl === sourceImageUrl &&
      existing.imageMirrorStatus === "ready" &&
      Boolean(existing.mirroredImagePath) &&
      Boolean(existing.mirroredImageWidth) &&
      Boolean(existing.mirroredImageHeight);

    const nextRecord: SourceGigRecord & {
      sourceId: string;
      externalId: string | null;
      checksum: string;
    } = {
      id: existing?.id ?? randomUUID(),
      gigId: input.gigId,
      sourceId: input.sourceId,
      sourceSlug: input.gig.sourceSlug,
      externalId: input.gig.externalId,
      checksum: input.gig.checksum,
      identityKey: input.gig.externalId ?? input.gig.checksum,
      sourceImageUrl,
      mirroredImagePath: unchangedReadyImage ? existing?.mirroredImagePath ?? null : null,
      mirroredImageWidth: unchangedReadyImage ? existing?.mirroredImageWidth ?? null : null,
      mirroredImageHeight: unchangedReadyImage ? existing?.mirroredImageHeight ?? null : null,
      imageMirrorStatus: !sourceImageUrl
        ? "missing"
        : unchangedReadyImage
          ? "ready"
          : "pending",
      imageMirroredAt: unchangedReadyImage ? existing?.imageMirroredAt ?? null : null
    };

    this.sourceGigs.set(nextRecord.id, nextRecord);

    return {
      inserted: !existing,
      sourceGig: nextRecord,
      shouldMirror: Boolean(sourceImageUrl) && !unchangedReadyImage
    };
  }

  async mirrorSourceGigImage(
    sourceGig: SourceGigRecord
  ): Promise<SourceGigImageMirrorResult> {
    const existing = this.sourceGigs.get(sourceGig.id);

    if (!existing) {
      throw new Error("source gig missing");
    }

    if (!sourceGig.sourceImageUrl) {
      return {
        status: "missing",
        mirroredImagePath: null,
        errorMessage: null,
        mirroredAt: null,
        mirroredImageWidth: null,
        mirroredImageHeight: null
      };
    }

    this.mirroredImageCalls.push(sourceGig.sourceImageUrl);

    if (this.failingImageUrls.has(sourceGig.sourceImageUrl)) {
      this.sourceGigs.set(sourceGig.id, {
        ...existing,
        imageMirrorStatus: "failed",
        mirroredImagePath: null,
        imageMirroredAt: null,
        mirroredImageWidth: null,
        mirroredImageHeight: null
      });

      return {
        status: "failed",
        mirroredImagePath: null,
        errorMessage: "Image request failed (503)",
        mirroredAt: null,
        mirroredImageWidth: null,
        mirroredImageHeight: null
      };
    }

    const mirroredImagePath = buildMirroredImagePath({
      sourceSlug: sourceGig.sourceSlug,
      identityKey: sourceGig.identityKey,
      sourceImageUrl: sourceGig.sourceImageUrl,
      contentType: "image/png"
    });
    const mirroredAt = new Date().toISOString();

    this.mirroredImagePaths.set(sourceGig.id, mirroredImagePath);
    this.sourceGigs.set(sourceGig.id, {
      ...existing,
      sourceImageUrl: sourceGig.sourceImageUrl,
      mirroredImagePath,
      imageMirrorStatus: "ready",
      imageMirroredAt: mirroredAt,
      mirroredImageWidth: 1200,
      mirroredImageHeight: 600
    });

    return {
      status: "ready",
      mirroredImagePath,
      errorMessage: null,
      mirroredAt,
      mirroredImageWidth: 1200,
      mirroredImageHeight: 600
    };
  }

  async listSourceGigsNeedingImageMirror(): Promise<SourceGigRecord[]> {
    return [...this.sourceGigs.values()].filter(shouldMirrorImage);
  }

  async replaceGigArtists(gigId: string, artists: string[]): Promise<void> {
    const uniqueArtistsBySlug = new Map<string, string>();

    for (const artist of artists) {
      const normalizedArtist = artist.trim();
      const artistSlug = slugify(normalizedArtist);

      if (!normalizedArtist || !artistSlug || uniqueArtistsBySlug.has(artistSlug)) {
        continue;
      }

      uniqueArtistsBySlug.set(artistSlug, normalizedArtist);
      this.artists.set(artistSlug, normalizedArtist);
    }

    this.gigArtists.set(gigId, [...uniqueArtistsBySlug.values()]);
  }
}

function createGig(title = "TIME", status: GigStatus = "active"): NormalizedGig {
  return createGigForSource({
    sourceSlug: "milk-bar",
    externalId: "f4fbba8d-7582-40fb-b5e5-4f0aedab965f",
    sourceUrl:
      "https://tickets.avclive.com.au/outlet/event/f4fbba8d-7582-40fb-b5e5-4f0aedab965f",
    title,
    status
  });
}

function createGigForSource(input: {
  sourceSlug: string;
  externalId: string;
  sourceUrl: string;
  title: string;
  status: GigStatus;
  imageUrl?: string | null;
  artists?: string[];
}): NormalizedGig {
  return {
    sourceSlug: input.sourceSlug,
    externalId: input.externalId,
    sourceUrl: input.sourceUrl,
    imageUrl: input.imageUrl ?? null,
    title: input.title,
    description: "Immersive Pink Floyd tribute show.",
    status: input.status,
    startsAt: "2026-04-10T11:30:00.000Z",
    endsAt: null,
    ticketUrl: input.sourceUrl,
    venue: {
      name: "Milk Bar",
      slug: "milk-bar",
      suburb: "Inglewood",
      address: "981 Beaufort Street",
      websiteUrl: "https://milkbarperth.com.au"
    },
    artists: input.artists ?? ["Time"],
    rawPayload: { EventName: input.title },
    checksum: buildGigChecksum({
      sourceSlug: input.sourceSlug,
      startsAt: "2026-04-10T11:30:00.000Z",
      title: input.title,
      venueSlug: "milk-bar",
      sourceUrl: input.sourceUrl
    })
  };
}

describe("executeSourceRun", () => {
  it("does not duplicate canonical gigs or source gigs on rerun", async () => {
    const store = new MemoryGigStore();
    const source: SourceAdapter = {
      slug: "milk-bar",
      name: "Milk Bar",
      baseUrl: "https://milkbarperth.com.au/gigs/",
      priority: 100,
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
    expect(store.imageBucketEnsured).toBe(true);
  });

  it("records a partial run when one listing fails but another succeeds", async () => {
    const store = new MemoryGigStore();
    const source: SourceAdapter = {
      slug: "milk-bar",
      name: "Milk Bar",
      baseUrl: "https://milkbarperth.com.au/gigs/",
      priority: 100,
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

  it("reuses the canonical gig when the same event arrives from two sources", async () => {
    const store = new MemoryGigStore();
    const aggregatorSource: SourceAdapter = {
      slug: "oztix-wa",
      name: "Oztix WA",
      baseUrl: "https://www.oztix.com.au/search?states%5B0%5D=WA&q=",
      priority: 10,
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

  it("keeps gig ingestion successful when image mirroring fails", async () => {
    const store = new MemoryGigStore();
    const imageUrl = "https://assets.oztix.com.au/image/doctor-jazz.png";
    store.failingImageUrls.add(imageUrl);
    const source: SourceAdapter = {
      slug: "oztix-wa",
      name: "Oztix WA",
      baseUrl: "https://www.oztix.com.au/search?states%5B0%5D=WA&q=",
      priority: 10,
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
    expect(sourceGig?.imageMirrorStatus).toBe("failed");
  });

  it("skips remirroring when the stored image URL is already ready", async () => {
    const store = new MemoryGigStore();
    const source: SourceAdapter = {
      slug: "oztix-wa",
      name: "Oztix WA",
      baseUrl: "https://www.oztix.com.au/search?states%5B0%5D=WA&q=",
      priority: 10,
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
    await executeSourceRun(store, source);

    expect(store.mirroredImageCalls).toEqual([
      "https://assets.oztix.com.au/image/doctor-jazz.png"
    ]);
  });

  it("remirrors when the source image URL changes", async () => {
    const store = new MemoryGigStore();
    let imageUrl = "https://assets.oztix.com.au/image/doctor-jazz-v1.png";
    const source: SourceAdapter = {
      slug: "oztix-wa",
      name: "Oztix WA",
      baseUrl: "https://www.oztix.com.au/search?states%5B0%5D=WA&q=",
      priority: 10,
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
    const firstPath = [...store.sourceGigs.values()][0]?.mirroredImagePath;
    imageUrl = "https://assets.oztix.com.au/image/doctor-jazz-v2.png";
    await executeSourceRun(store, source);
    const secondPath = [...store.sourceGigs.values()][0]?.mirroredImagePath;

    expect(store.mirroredImageCalls).toEqual([
      "https://assets.oztix.com.au/image/doctor-jazz-v1.png",
      "https://assets.oztix.com.au/image/doctor-jazz-v2.png"
    ]);
    expect(firstPath).not.toBe(secondPath);
  });

  it("dedupes repeated artist names by slug before storing joins", async () => {
    const store = new MemoryGigStore();
    const source: SourceAdapter = {
      slug: "oztix-wa",
      name: "Oztix WA",
      baseUrl: "https://www.oztix.com.au/search?states%5B0%5D=WA&q=",
      priority: 10,
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
});
