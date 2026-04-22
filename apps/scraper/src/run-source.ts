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
  hadPostProcessingError: boolean;
  errorMessage: string | null;
}): SourceExecutionResult {
  const finishedAt = nowIso();
  const processedCount = input.insertedCount + input.updatedCount;
  const hasErrors = input.failedCount > 0 || input.hadPostProcessingError;
  const status =
    processedCount === 0 && hasErrors
      ? "failed"
      : hasErrors
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
  gig: NormalizedGig
): Promise<{ outcome: "inserted" | "updated"; gigId: string }> {
  const venue = await store.upsertVenue(gig);
  const existingSourceGig = await store.findSourceGig(source.id, gig.externalId, gig.checksum);
  const matchedGig = await store.findCanonicalGig({
    venueId: venue.id,
    startsAt: gig.startsAt,
    title: gig.title,
    excludeGigId: existingSourceGig?.gigId ?? null
  });

  if (
    existingSourceGig &&
    matchedGig &&
    matchedGig.id !== existingSourceGig.gigId
  ) {
    await store.prepareSourceGigReattachment({
      sourceGigId: existingSourceGig.id,
      currentGigId: existingSourceGig.gigId,
      targetGigId: matchedGig.id,
      sourceId: source.id
    });
  }

  const targetGigId = matchedGig?.id ?? existingSourceGig?.gigId ?? null;

  const result = await store.saveGig({
    existingGigId: targetGigId,
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

  await store.upsertSourceGig({
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

  return {
    outcome: result.inserted ? "inserted" : "updated",
    gigId: result.gig.id
  };
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

  const startedAt = nowIso();
  const runId = await store.startScrapeRun(sourceRecord.id, startedAt);

  try {
    const { gigs, failedCount: parseFailures } = await source.fetchListings(fetchImpl);
    let insertedCount = 0;
    let updatedCount = 0;
    let failedCount = parseFailures;
    const errors: string[] = [];
    const retainedIdentityKeys = new Set<string>();
    const touchedGigIds = new Set<string>();
    let hadPostProcessingError = false;

    for (const gig of gigs) {
      try {
        const result = await processGig(store, sourceRecord, {
          ...gig,
          venue: {
            ...gig.venue,
            slug: gig.venue.slug || buildGigSlug({
              venueSlug: "venue",
              startsAt: gig.startsAt,
              title: gig.venue.name
            })
          }
        });

        retainedIdentityKeys.add(gig.externalId ?? gig.checksum);
        touchedGigIds.add(result.gigId);

        if (result.outcome === "inserted") {
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
      try {
        await store.pruneStaleUpcomingSourceGigs({
          sourceId: sourceRecord.id,
          retainedIdentityKeys: [...retainedIdentityKeys]
        });
      } catch (error) {
        hadPostProcessingError = true;
        errors.push(
          error instanceof Error
            ? `Unable to prune stale source gigs: ${error.message}`
            : "Unable to prune stale source gigs"
        );
      }
    }

    if (touchedGigIds.size > 0) {
      try {
        await store.syncGigArtistsFromSourceGigs([...touchedGigIds]);
      } catch (error) {
        hadPostProcessingError = true;
        errors.push(
          error instanceof Error
            ? `Unable to sync canonical artists: ${error.message}`
            : "Unable to sync canonical artists"
        );
      }
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
      hadPostProcessingError,
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
