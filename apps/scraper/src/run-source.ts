import {
  buildGigSlug,
  type NormalizedGig
} from "@perth-gig-finder/shared";

import type { GigStore, SourceAdapter, SourceExecutionResult } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function buildPartialResult(input: {
  sourceSlug: string;
  sourceId: string;
  runId: string;
  startedAt: string;
  insertedCount: number;
  updatedCount: number;
  failedCount: number;
  errorMessage: string | null;
}): SourceExecutionResult {
  const finishedAt = nowIso();
  const processedCount = input.insertedCount + input.updatedCount;
  const status =
    processedCount === 0 && input.failedCount > 0
      ? "failed"
      : input.failedCount > 0
        ? "partial"
        : "success";

  return {
    sourceSlug: input.sourceSlug,
    sourceId: input.sourceId,
    runId: input.runId,
    status,
    discoveredCount: processedCount + input.failedCount,
    insertedCount: input.insertedCount,
    updatedCount: input.updatedCount,
    failedCount: input.failedCount,
    errorMessage: input.errorMessage,
    startedAt: input.startedAt,
    finishedAt
  };
}

async function processGig(
  store: GigStore,
  source: { id: string; priority: number },
  gig: NormalizedGig,
  fetchImpl: typeof fetch
): Promise<"inserted" | "updated"> {
  const venue = await store.upsertVenue(gig);
  const existingSourceGig = await store.findSourceGig(source.id, gig.externalId, gig.checksum);
  const matchedGig = existingSourceGig
    ? { id: existingSourceGig.gigId }
    : await store.findCanonicalGig({
        venueId: venue.id,
        startsAt: gig.startsAt,
        title: gig.title
      });

  const result = await store.saveGig({
    existingGigId: matchedGig?.id ?? null,
    gig: {
      ...gig,
      venue: {
        ...gig.venue,
        slug: venue.slug
      }
    },
    venueId: venue.id,
    sourceId: source.id,
    sourcePriority: source.priority
  });

  const sourceGigResult = await store.upsertSourceGig({
    sourceId: source.id,
    gigId: result.gig.id,
    gig: {
      ...gig,
      venue: {
        ...gig.venue,
        slug: venue.slug
      }
    }
  });

  if (sourceGigResult.shouldMirror) {
    await store.mirrorSourceGigImage(sourceGigResult.sourceGig, fetchImpl);
  }

  await store.replaceGigArtists(result.gig.id, gig.artists);

  return result.inserted ? "inserted" : "updated";
}

export async function executeSourceRun(
  store: GigStore,
  source: SourceAdapter,
  fetchImpl: typeof fetch = fetch
): Promise<SourceExecutionResult> {
  const sourceRecord = await store.ensureSource({
    slug: source.slug,
    name: source.name,
    baseUrl: source.baseUrl,
    priority: source.priority,
    isPublicListingSource: source.isPublicListingSource
  });
  await store.ensureImageBucket();

  const startedAt = nowIso();
  const runId = await store.startScrapeRun(sourceRecord.id, startedAt);

  try {
    const { gigs, failedCount: parseFailures } = await source.fetchListings(fetchImpl);
    let insertedCount = 0;
    let updatedCount = 0;
    let failedCount = parseFailures;
    const errors: string[] = [];
    const retainedIdentityKeys = new Set<string>();

    for (const gig of gigs) {
      try {
        const outcome = await processGig(store, sourceRecord, {
          ...gig,
          venue: {
            ...gig.venue,
            slug: gig.venue.slug || buildGigSlug({
              venueSlug: "venue",
              startsAt: gig.startsAt,
              title: gig.venue.name
            })
          }
        }, fetchImpl);

        retainedIdentityKeys.add(gig.externalId ?? gig.checksum);

        if (outcome === "inserted") {
          insertedCount += 1;
        } else {
          updatedCount += 1;
        }
      } catch (error) {
        failedCount += 1;
        errors.push(error instanceof Error ? error.message : "Unexpected gig error");
      }
    }

    if (failedCount === 0 && gigs.length > 0) {
      await store.pruneStaleUpcomingSourceGigs({
        sourceId: sourceRecord.id,
        retainedIdentityKeys: [...retainedIdentityKeys]
      });
    }

    if (parseFailures > 0) {
      errors.push(`${parseFailures} listing(s) could not be normalized from the source feed`);
    }

    const errorMessage =
      errors.length > 0 ? errors.slice(0, 3).join(" | ") : null;

    const result = buildPartialResult({
      sourceSlug: source.slug,
      sourceId: sourceRecord.id,
      runId,
      startedAt,
      insertedCount,
      updatedCount,
      failedCount,
      errorMessage
    });

    await store.finishScrapeRun(runId, {
      status: result.status,
      discoveredCount: result.discoveredCount,
      insertedCount,
      updatedCount,
      failedCount,
      errorMessage,
      finishedAt: result.finishedAt
    });

    return result;
  } catch (error) {
    const finishedAt = nowIso();
    const errorMessage =
      error instanceof Error ? error.message : "Unexpected scraper failure";

    await store.finishScrapeRun(runId, {
      status: "failed",
      discoveredCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      errorMessage,
      finishedAt
    });

    return {
      sourceSlug: source.slug,
      sourceId: sourceRecord.id,
      runId,
      status: "failed",
      discoveredCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      errorMessage,
      startedAt,
      finishedAt
    };
  }
}
