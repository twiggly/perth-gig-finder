import { randomUUID } from "node:crypto";

import {
  areCanonicalTitlesCompatible,
  buildGigChecksum,
  buildGigSlug,
  type GigStatus,
  normalizeCanonicalTitleForMatch,
  normalizeTitleForMatch,
  slugify,
  slugifyVenueName,
  type NormalizedGig,
  type StartsAtPrecision
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

const PERTH_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

function getPerthDayKey(startsAt: string): string {
  const perthDate = new Date(new Date(startsAt).getTime() + PERTH_UTC_OFFSET_MS);
  return perthDate.toISOString().slice(0, 10);
}

function chooseTextField(
  existingValue: string | null,
  incomingValue: string | null,
  canReplaceCanonical: boolean
): string | null {
  if (!existingValue) {
    return incomingValue;
  }

  if (!incomingValue) {
    return existingValue;
  }

  return canReplaceCanonical ? incomingValue : existingValue;
}

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
      startsAtPrecision: StartsAtPrecision;
      status: GigStatus;
      normalizedTitle: string;
      canonicalTitle: string;
      sourceUrl: string;
      description: string | null;
      ticketUrl: string | null;
    }
  >();
  readonly sourceGigs = new Map<
    string,
    SourceGigRecord & {
      sourceId: string;
      externalId: string | null;
      checksum: string;
      sourceUrl: string;
    }
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
    isPublicListingSource: boolean;
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

  private listSourceGigsForSourceAndGig(
    sourceId: string,
    gigId: string
  ): Array<
    SourceGigRecord & {
      sourceId: string;
      externalId: string | null;
      checksum: string;
      sourceUrl: string;
    }
  > {
    return [...this.sourceGigs.values()].filter(
      (sourceGig) => sourceGig.sourceId === sourceId && sourceGig.gigId === gigId
    );
  }

  private pickAttachedSourceGigKeeper(
    rows: Array<
      SourceGigRecord & {
        sourceId: string;
        externalId: string | null;
        checksum: string;
        sourceUrl: string;
      }
    >,
    preferredIdentityKey: string
  ) {
    const matchingIdentityRow = rows.find(
      (row) => row.identityKey === preferredIdentityKey
    );

    if (matchingIdentityRow) {
      return matchingIdentityRow;
    }

    const readyMirroredRow = rows.find(
      (row) =>
        row.imageMirrorStatus === "ready" &&
        Boolean(row.mirroredImagePath) &&
        Boolean(row.mirroredImageWidth) &&
        Boolean(row.mirroredImageHeight)
    );

    if (readyMirroredRow) {
      return readyMirroredRow;
    }

    return rows[0] ?? null;
  }

  async findCanonicalGig(
    input: {
      venueId: string;
      startsAt: string;
      title: string;
    }
  ): Promise<GigRecord | null> {
    const normalizedTitle = normalizeTitleForMatch(input.title);
    const canonicalTitle = normalizeCanonicalTitleForMatch(input.title);

    for (const gig of this.gigs.values()) {
      if (
        gig.venueId === input.venueId &&
        gig.startsAt === input.startsAt &&
        gig.normalizedTitle === normalizedTitle
      ) {
        return gig;
      }
    }

    const canonicalMatches = [...this.gigs.values()].filter(
      (gig) =>
        gig.venueId === input.venueId &&
        getPerthDayKey(gig.startsAt) === getPerthDayKey(input.startsAt) &&
        gig.canonicalTitle === canonicalTitle
    );

    if (canonicalMatches.length === 1) {
      return canonicalMatches[0];
    }

    if (canonicalMatches.length > 1) {
      return null;
    }

    const fuzzyMatches = [...this.gigs.values()].filter(
      (gig) =>
        gig.venueId === input.venueId &&
        getPerthDayKey(gig.startsAt) === getPerthDayKey(input.startsAt) &&
        areCanonicalTitlesCompatible(gig.title, input.title)
    );

    if (fuzzyMatches.length === 1) {
      return fuzzyMatches[0];
    }

    return null;
  }

  async saveGig(input: {
    existingGigId: string | null;
    gig: NormalizedGig;
    venueId: string;
    sourceId: string;
    sourcePriority: number;
  }): Promise<{ gig: GigRecord; inserted: boolean }> {
    if (input.existingGigId) {
      const existing = this.gigs.get(input.existingGigId);

      if (!existing) {
        throw new Error("existing gig not found");
      }

      const attachedSourceGigs = [...this.sourceGigs.values()].filter(
        (sourceGig) => sourceGig.gigId === existing.id
      );
      const ownerSource =
        attachedSourceGigs.find((sourceGig) => sourceGig.sourceUrl === existing.sourceUrl) ??
        attachedSourceGigs
          .slice()
          .sort((left, right) => {
            const leftPriority = this.sources.get(left.sourceSlug)?.priority ?? 0;
            const rightPriority = this.sources.get(right.sourceSlug)?.priority ?? 0;
            return rightPriority - leftPriority;
          })[0];
      const ownerPriority = ownerSource
        ? (this.sources.get(ownerSource.sourceSlug)?.priority ?? 0)
        : 0;
      const canReplaceCanonical =
        !ownerSource ||
        ownerSource.sourceId === input.sourceId ||
        input.sourcePriority > ownerPriority;
      const hasAttachedExactTime = attachedSourceGigs.some(
        (sourceGig) => sourceGig.startsAtPrecision === "exact"
      );
      const shouldUpgradeStartsAt =
        input.gig.startsAtPrecision === "exact" &&
        !hasAttachedExactTime &&
        input.gig.startsAt !== existing.startsAt;
      const shouldPreserveExactStartsAt =
        input.gig.startsAtPrecision === "date" &&
        (existing.startsAtPrecision === "exact" || hasAttachedExactTime);
      const startsAt =
        shouldUpgradeStartsAt ||
        (canReplaceCanonical && !shouldPreserveExactStartsAt)
          ? input.gig.startsAt
          : existing.startsAt;
      const startsAtPrecision =
        shouldUpgradeStartsAt ||
        (canReplaceCanonical && !shouldPreserveExactStartsAt)
          ? input.gig.startsAtPrecision
          : existing.startsAtPrecision;
      const title =
        chooseTextField(existing.title, input.gig.title, canReplaceCanonical) ?? input.gig.title;
      const description = chooseTextField(
        existing.description,
        input.gig.description,
        canReplaceCanonical
      );
      const ticketUrl = chooseTextField(
        existing.ticketUrl,
        input.gig.ticketUrl,
        canReplaceCanonical
      );
      const sourceUrl =
        chooseTextField(existing.sourceUrl, input.gig.sourceUrl, canReplaceCanonical) ??
        input.gig.sourceUrl;
      const updated = {
        ...existing,
        slug: buildGigSlug({
          venueSlug: input.gig.venue.slug,
          startsAt,
          title
        }),
        venueId: input.venueId,
        startsAt,
        startsAtPrecision,
        status: canReplaceCanonical ? input.gig.status : existing.status,
        normalizedTitle: normalizeTitleForMatch(title),
        canonicalTitle: normalizeCanonicalTitleForMatch(title),
        description,
        ticketUrl,
        sourceUrl,
        title
      };
      this.gigs.set(existing.id, updated);
      return { gig: updated, inserted: false };
    }

    const gig = {
      id: randomUUID(),
      slug: buildGigSlug({
        venueSlug: input.gig.venue.slug,
        startsAt: input.gig.startsAt,
        title: input.gig.title
      }),
      title: input.gig.title,
      venueId: input.venueId,
      startsAt: input.gig.startsAt,
      startsAtPrecision: input.gig.startsAtPrecision,
      status: input.gig.status,
      normalizedTitle: normalizeTitleForMatch(input.gig.title),
      canonicalTitle: normalizeCanonicalTitleForMatch(input.gig.title),
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
    const preferredIdentityKey = input.gig.externalId ?? input.gig.checksum;
    const existingByIdentity = await this.findSourceGig(
      input.sourceId,
      input.gig.externalId,
      input.gig.checksum
    );
    const attachedSourceGigs = this.listSourceGigsForSourceAndGig(
      input.sourceId,
      input.gigId
    );
    const reusableAttachedSourceGig = this.pickAttachedSourceGigKeeper(
      attachedSourceGigs,
      preferredIdentityKey
    );
    const existing = existingByIdentity ?? reusableAttachedSourceGig;

    if (existing) {
      for (const sourceGig of attachedSourceGigs) {
        if (sourceGig.id !== existing.id) {
          this.sourceGigs.delete(sourceGig.id);
        }
      }
    }

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
      sourceUrl: string;
    } = {
      id: existing?.id ?? randomUUID(),
      gigId: input.gigId,
      sourceId: input.sourceId,
      sourceSlug: input.gig.sourceSlug,
      externalId: input.gig.externalId,
      checksum: input.gig.checksum,
      identityKey: input.gig.externalId ?? input.gig.checksum,
      startsAtPrecision: input.gig.startsAtPrecision,
      sourceUrl: input.gig.sourceUrl,
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

  async pruneStaleUpcomingSourceGigs(input: {
    sourceId: string;
    retainedIdentityKeys: string[];
  }): Promise<void> {
    const retainedIdentityKeys = new Set(input.retainedIdentityKeys);
    const nowIsoValue = new Date().toISOString();

    for (const sourceGig of [...this.sourceGigs.values()]) {
      if (sourceGig.sourceId !== input.sourceId) {
        continue;
      }

      if (retainedIdentityKeys.has(sourceGig.identityKey)) {
        continue;
      }

      const gig = this.gigs.get(sourceGig.gigId);

      if (!gig || gig.status !== "active" || gig.startsAt < nowIsoValue) {
        continue;
      }

      this.sourceGigs.delete(sourceGig.id);
    }
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

  async listSourceGigsNeedingImageMirror(force = false): Promise<SourceGigRecord[]> {
    return force
      ? [...this.sourceGigs.values()].filter((sourceGig) => Boolean(sourceGig.sourceImageUrl))
      : [...this.sourceGigs.values()].filter(shouldMirrorImage);
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
  startsAt?: string;
  startsAtPrecision?: StartsAtPrecision;
  imageUrl?: string | null;
  artists?: string[];
  venueName?: string;
  venueSuburb?: string | null;
  venueAddress?: string | null;
  venueWebsiteUrl?: string | null;
}): NormalizedGig {
  const venueName = input.venueName ?? "Milk Bar";
  const venueSuburb = input.venueSuburb ?? "Inglewood";
  const venueAddress = input.venueAddress ?? "981 Beaufort Street";
  const venueWebsiteUrl = input.venueWebsiteUrl ?? "https://milkbarperth.com.au";
  const startsAt = input.startsAt ?? "2026-04-10T11:30:00.000Z";

  return {
    sourceSlug: input.sourceSlug,
    externalId: input.externalId,
    sourceUrl: input.sourceUrl,
    imageUrl: input.imageUrl ?? null,
    title: input.title,
    description: "Immersive Pink Floyd tribute show.",
    status: input.status,
    startsAt,
    startsAtPrecision: input.startsAtPrecision ?? "exact",
    endsAt: null,
    ticketUrl: input.sourceUrl,
    venue: {
      name: venueName,
      slug: slugifyVenueName(venueName),
      suburb: venueSuburb,
      address: venueAddress,
      websiteUrl: venueWebsiteUrl
    },
    artists: input.artists ?? ["Time"],
    rawPayload: { EventName: input.title },
    checksum: buildGigChecksum({
      sourceSlug: input.sourceSlug,
      startsAt,
      title: input.title,
      venueSlug: slugifyVenueName(venueName),
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
    expect(store.imageBucketEnsured).toBe(true);
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
      sourceUrl: "https://tickets.oztix.com.au/outlet/event/art-of-dysfunction-b",
      sourceImageUrl: null,
      mirroredImagePath: null,
      imageMirrorStatus: "missing",
      imageMirroredAt: null,
      mirroredImageWidth: null,
      mirroredImageHeight: null
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
      isPublicListingSource: false,
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
      isPublicListingSource: false,
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
        startsAt: "2026-05-01T12:00:00.000Z",
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
      isPublicListingSource: false,
      async fetchListings() {
        return {
          gigs,
          failedCount: 0
        };
      }
    };

    await executeSourceRun(store, source);
    expect(store.sourceGigs.size).toBe(2);

    gigs = [gigs[0]];
    await executeSourceRun(store, source);

    expect(store.sourceGigs.size).toBe(1);
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
        startsAt: "2026-05-01T12:00:00.000Z",
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
      isPublicListingSource: false,
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

  it("keeps gig ingestion successful when image mirroring fails", async () => {
    const store = new MemoryGigStore();
    const imageUrl = "https://assets.oztix.com.au/image/doctor-jazz.png";
    store.failingImageUrls.add(imageUrl);
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
    expect(sourceGig?.imageMirrorStatus).toBe("failed");
  });

  it("skips remirroring when the stored image URL is already ready", async () => {
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
});
