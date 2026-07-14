import { randomUUID } from "node:crypto";

import {
  type ArtistExtractionKind,
  areCanonicalTitlesCompatible,
  buildGigChecksum,
  buildGigSlug,
  type GigStatus,
  type JsonValue,
  normalizeCanonicalTitleForMatch,
  normalizeTitleForMatch,
  slugify,
  slugifyVenueName,
  type NormalizedGig,
  type StartsAtPrecision
} from "@perth-gig-finder/shared";
import {
  normalizeArtistNames,
  selectCanonicalArtistNames
} from "../../artist-utils";
import { buildMirroredImagePath, shouldMirrorImage } from "../../image-mirror";
import type {
  GigRecord,
  GigStore,
  SourceGigImageMirrorResult,
  SourceAdapter,
  SourceGigRecord,
  SourceRecord,
  VenueRecord
} from "../../types";

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

export class MemoryGigStore implements GigStore {
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
      lastSeenAt: string;
      rawPayload?: JsonValue;
    }
  >();
  readonly artists = new Map<string, string>();
  readonly gigArtists = new Map<string, string[]>();
  readonly mirroredImagePaths = new Map<string, string>();
  readonly mirroredImageCalls: string[] = [];
  readonly syncArtistCallBatches: string[][] = [];
  readonly touchSourceGigsSeenBatches: string[][] = [];
  readonly failingImageUrls = new Set<string>();
  findCanonicalGigCalls = 0;
  saveGigCalls = 0;
  upsertSourceGigCalls = 0;
  syncGigArtistsError: string | null = null;
  imageBucketEnsured = false;
  preloadSourceRunStateCalls = 0;

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

  async preloadSourceRunState(_input: {
    sourceId: string;
    gigs: NormalizedGig[];
    now: string;
  }): Promise<void> {
    this.preloadSourceRunStateCalls += 1;
  }

  async loadSourceGigPayloads(
    sourceId: string,
    externalIds: string[]
  ): Promise<Map<string, JsonValue>> {
    const requestedExternalIds = new Set(externalIds);
    const payloads = new Map<string, JsonValue>();

    for (const sourceGig of this.sourceGigs.values()) {
      if (
        sourceGig.sourceId === sourceId &&
        sourceGig.externalId &&
        requestedExternalIds.has(sourceGig.externalId) &&
        sourceGig.rawPayload !== undefined
      ) {
        payloads.set(sourceGig.externalId, sourceGig.rawPayload);
      }
    }

    return payloads;
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
      lastSeenAt: string;
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
      excludeGigId?: string | null;
    }
  ): Promise<GigRecord | null> {
    this.findCanonicalGigCalls += 1;
    const normalizedTitle = normalizeTitleForMatch(input.title);
    const canonicalTitle = normalizeCanonicalTitleForMatch(input.title);

    for (const gig of this.gigs.values()) {
      if (
        gig.id !== input.excludeGigId &&
        gig.venueId === input.venueId &&
        gig.startsAt === input.startsAt &&
        gig.normalizedTitle === normalizedTitle
      ) {
        return gig;
      }
    }

    const canonicalMatches = [...this.gigs.values()].filter(
      (gig) =>
        gig.id !== input.excludeGigId &&
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
        gig.id !== input.excludeGigId &&
        gig.venueId === input.venueId &&
        getPerthDayKey(gig.startsAt) === getPerthDayKey(input.startsAt) &&
        areCanonicalTitlesCompatible(gig.title, input.title)
    );

    if (fuzzyMatches.length === 1) {
      return fuzzyMatches[0];
    }

    return null;
  }

  async tryReuseUnchangedSourceGig(input: {
    sourceId: string;
    gig: NormalizedGig;
    venueId: string;
    sourcePriority: number;
  }): Promise<{ gigId: string; sourceGigId: string } | null> {
    const existingSourceGig = await this.findSourceGig(
      input.sourceId,
      input.gig.externalId,
      input.gig.checksum
    );

    if (!existingSourceGig) {
      return null;
    }

    const normalizedArtists = normalizeArtistNames(input.gig.artists);

    if (
      existingSourceGig.externalId !== input.gig.externalId ||
      existingSourceGig.checksum !== input.gig.checksum ||
      existingSourceGig.sourceUrl !== input.gig.sourceUrl ||
      existingSourceGig.startsAtPrecision !== input.gig.startsAtPrecision ||
      existingSourceGig.sourceImageUrl !== input.gig.imageUrl ||
      existingSourceGig.artistExtractionKind !== input.gig.artistExtractionKind ||
      existingSourceGig.artistNames.length !== normalizedArtists.length ||
      !existingSourceGig.artistNames.every(
        (artist, index) => artist === normalizedArtists[index]
      )
    ) {
      return null;
    }

    const attachedSourceGigs = this.listSourceGigsForSourceAndGig(
      input.sourceId,
      existingSourceGig.gigId
    );

    if (
      attachedSourceGigs.length !== 1 ||
      attachedSourceGigs[0]?.id !== existingSourceGig.id
    ) {
      return null;
    }

    const existingGig = this.gigs.get(existingSourceGig.gigId);

    if (!existingGig) {
      return null;
    }

    const expectedSlug = buildGigSlug({
      venueSlug: input.gig.venue.slug,
      startsAt: input.gig.startsAt,
      title: input.gig.title
    });

    if (
      existingGig.slug !== expectedSlug ||
      existingGig.venueId !== input.venueId ||
      existingGig.title !== input.gig.title ||
      existingGig.startsAt !== input.gig.startsAt ||
      existingGig.status !== input.gig.status ||
      existingGig.description !== input.gig.description ||
      existingGig.ticketUrl !== input.gig.ticketUrl ||
      existingGig.sourceUrl !== input.gig.sourceUrl
    ) {
      return null;
    }

    return {
      gigId: existingSourceGig.gigId,
      sourceGigId: existingSourceGig.id
    };
  }

  async saveGig(input: {
    existingGigId: string | null;
    gig: NormalizedGig;
    venueId: string;
    sourceId: string;
    sourcePriority: number;
  }): Promise<{ gig: GigRecord; inserted: boolean }> {
    this.saveGigCalls += 1;

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
  }> {
    this.upsertSourceGigCalls += 1;
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
      lastSeenAt: string;
      rawPayload: JsonValue;
    } = {
      id: existing?.id ?? randomUUID(),
      gigId: input.gigId,
      sourceId: input.sourceId,
      sourceSlug: input.gig.sourceSlug,
      externalId: input.gig.externalId,
      checksum: input.gig.checksum,
      identityKey: input.gig.externalId ?? input.gig.checksum,
      startsAtPrecision: input.gig.startsAtPrecision,
      artistNames: normalizeArtistNames(input.gig.artists),
      artistExtractionKind: input.gig.artistExtractionKind,
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
      imageMirroredAt: unchangedReadyImage ? existing?.imageMirroredAt ?? null : null,
      lastSeenAt: new Date().toISOString(),
      rawPayload: input.gig.rawPayload
    };

    this.sourceGigs.set(nextRecord.id, nextRecord);

    return {
      inserted: !existing,
      sourceGig: nextRecord
    };
  }

  async touchSourceGigsSeen(sourceGigIds: string[], seenAt: string): Promise<void> {
    const uniqueSourceGigIds = [...new Set(sourceGigIds)];
    this.touchSourceGigsSeenBatches.push(uniqueSourceGigIds);

    for (const sourceGigId of uniqueSourceGigIds) {
      const existing = this.sourceGigs.get(sourceGigId);

      if (existing) {
        this.sourceGigs.set(sourceGigId, {
          ...existing,
          lastSeenAt: seenAt
        });
      }
    }
  }

  async prepareSourceGigReattachment(input: {
    sourceGigId: string;
    currentGigId: string;
    targetGigId: string;
    sourceId: string;
  }): Promise<void> {
    if (input.currentGigId === input.targetGigId) {
      return;
    }

    const attachedSourceGigs = [...this.sourceGigs.values()].filter(
      (sourceGig) => sourceGig.gigId === input.currentGigId
    );

    if (
      attachedSourceGigs.length !== 1 ||
      attachedSourceGigs[0]?.id !== input.sourceGigId ||
      attachedSourceGigs[0]?.sourceId !== input.sourceId
    ) {
      return;
    }

    this.sourceGigs.delete(input.sourceGigId);
    this.gigs.delete(input.currentGigId);
  }

  async pruneStaleUpcomingSourceGigs(input: {
    sourceId: string;
    retainedIdentityKeys: string[];
  }): Promise<void> {
    const retainedIdentityKeys = new Set(input.retainedIdentityKeys);
    const nowIsoValue = new Date().toISOString();
    const affectedGigIds = new Set<string>();

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
      affectedGigIds.add(sourceGig.gigId);
    }

    for (const gigId of [...affectedGigIds]) {
      const hasRemainingSourceGig = [...this.sourceGigs.values()].some(
        (sourceGig) => sourceGig.gigId === gigId
      );

      if (!hasRemainingSourceGig) {
        this.gigs.delete(gigId);
        this.gigArtists.delete(gigId);
        affectedGigIds.delete(gigId);
      }
    }

    if (affectedGigIds.size > 0) {
      await this.syncGigArtistsFromSourceGigs([...affectedGigIds]);
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
      bytes: Buffer.from(sourceGig.sourceImageUrl),
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

  async syncGigArtistsFromSourceGigs(gigIds: string[]): Promise<void> {
    const uniqueGigIds = [...new Set(gigIds)];
    this.syncArtistCallBatches.push(uniqueGigIds);

    if (this.syncGigArtistsError) {
      throw new Error(this.syncGigArtistsError);
    }

    for (const gigId of uniqueGigIds) {
      const candidates = [...this.sourceGigs.values()]
        .filter((sourceGig) => sourceGig.gigId === gigId)
        .map((sourceGig) => ({
          artists: sourceGig.artistNames,
          artistExtractionKind: sourceGig.artistExtractionKind,
          priority: this.sources.get(sourceGig.sourceSlug)?.priority ?? 0,
          lastSeenAt: sourceGig.lastSeenAt
        }));
      const canonicalArtists = selectCanonicalArtistNames(candidates);

      for (const artist of canonicalArtists) {
        const artistSlug = slugify(artist);

        if (artistSlug) {
          this.artists.set(artistSlug, artist);
        }
      }

      this.gigArtists.set(gigId, canonicalArtists);
    }
  }
}

export function createGig(title = "TIME", status: GigStatus = "active"): NormalizedGig {
  return createGigForSource({
    sourceSlug: "milk-bar",
    externalId: "f4fbba8d-7582-40fb-b5e5-4f0aedab965f",
    sourceUrl:
      "https://tickets.avclive.com.au/outlet/event/f4fbba8d-7582-40fb-b5e5-4f0aedab965f",
    title,
    status
  });
}

export function createGigForSource(input: {
  sourceSlug: string;
  externalId: string;
  sourceUrl: string;
  title: string;
  status: GigStatus;
  startsAt?: string;
  startsAtPrecision?: StartsAtPrecision;
  imageUrl?: string | null;
  artists?: string[];
  artistExtractionKind?: ArtistExtractionKind;
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
    artistExtractionKind: input.artistExtractionKind ?? "structured",
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

export function seedDuplicateReattachmentFixture(input: {
  canonicalTitle: string;
  duplicateTitle: string;
  sourceSlug: string;
  sourceName: string;
  sourceBaseUrl: string;
  venueName: string;
  startsAt: string;
}): {
  store: MemoryGigStore;
  source: SourceAdapter;
  existingGigId: string;
} {
  const store = new MemoryGigStore();
  const venue = {
    id: randomUUID(),
    slug: slugifyVenueName(input.venueName),
    name: input.venueName
  };
  store.venues.set(venue.slug, venue);

  const canonicalSource = {
    id: randomUUID(),
    slug: "canonical-source",
    name: "Canonical Source",
    baseUrl: "https://example.com/canonical",
    priority: 100,
    isPublicListingSource: true
  } satisfies SourceRecord;
  const duplicateSource = {
    id: randomUUID(),
    slug: input.sourceSlug,
    name: input.sourceName,
    baseUrl: input.sourceBaseUrl,
    priority: 50,
    isPublicListingSource: true
  } satisfies SourceRecord;
  store.sources.set(canonicalSource.slug, canonicalSource);
  store.sources.set(duplicateSource.slug, duplicateSource);

  const existingGigId = randomUUID();
  const duplicateGigId = randomUUID();
  store.gigs.set(existingGigId, {
    id: existingGigId,
    slug: buildGigSlug({
      venueSlug: venue.slug,
      startsAt: input.startsAt,
      title: input.canonicalTitle
    }),
    title: input.canonicalTitle,
    venueId: venue.id,
    startsAt: input.startsAt,
    startsAtPrecision: "exact",
    status: "active",
    normalizedTitle: normalizeTitleForMatch(input.canonicalTitle),
    canonicalTitle: normalizeCanonicalTitleForMatch(input.canonicalTitle),
    sourceUrl: `${canonicalSource.baseUrl}/event`,
    description: null,
    ticketUrl: `${canonicalSource.baseUrl}/event`
  });
  store.gigs.set(duplicateGigId, {
    id: duplicateGigId,
    slug: buildGigSlug({
      venueSlug: venue.slug,
      startsAt: input.startsAt,
      title: input.duplicateTitle
    }),
    title: input.duplicateTitle,
    venueId: venue.id,
    startsAt: input.startsAt,
    startsAtPrecision: "exact",
    status: "active",
    normalizedTitle: normalizeTitleForMatch(input.duplicateTitle),
    canonicalTitle: normalizeCanonicalTitleForMatch(input.duplicateTitle),
    sourceUrl: `${duplicateSource.baseUrl}/event`,
    description: null,
    ticketUrl: `${duplicateSource.baseUrl}/event`
  });

  const existingSourceGigId = randomUUID();
  store.sourceGigs.set(existingSourceGigId, {
    id: existingSourceGigId,
    gigId: existingGigId,
    sourceSlug: canonicalSource.slug,
    sourceId: canonicalSource.id,
    identityKey: `${input.canonicalTitle}-canonical`,
    externalId: `${input.canonicalTitle}-canonical`,
    checksum: `${input.canonicalTitle}-canonical-checksum`,
    sourceUrl: `${canonicalSource.baseUrl}/event`,
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

  const duplicateSourceGigId = randomUUID();
  const duplicateExternalId = `${input.duplicateTitle}-duplicate`;
  const duplicateChecksum = `${input.duplicateTitle}-duplicate-checksum`;
  store.sourceGigs.set(duplicateSourceGigId, {
    id: duplicateSourceGigId,
    gigId: duplicateGigId,
    sourceSlug: duplicateSource.slug,
    sourceId: duplicateSource.id,
    identityKey: duplicateExternalId,
    externalId: duplicateExternalId,
    checksum: duplicateChecksum,
    sourceUrl: `${duplicateSource.baseUrl}/event`,
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

  return {
    store,
    source: {
      slug: duplicateSource.slug,
      name: duplicateSource.name,
      baseUrl: duplicateSource.baseUrl,
      priority: duplicateSource.priority,
      isPublicListingSource: true,
      async fetchListings() {
        return {
          gigs: [
            createGigForSource({
              sourceSlug: duplicateSource.slug,
              externalId: duplicateExternalId,
              sourceUrl: `${duplicateSource.baseUrl}/event`,
              title: input.duplicateTitle,
              status: "active",
              startsAt: input.startsAt,
              venueName: input.venueName
            })
          ],
          failedCount: 0
        };
      }
    },
    existingGigId
  };
}
