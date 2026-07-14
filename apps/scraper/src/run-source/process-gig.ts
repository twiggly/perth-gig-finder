import type { NormalizedGig } from "@perth-gig-finder/shared";

import type { GigStore } from "../types";

export interface ProcessGigResult {
  outcome: "inserted" | "updated";
  gigId: string;
  sourceGigId: string | null;
  changed: boolean;
}

export async function processGig(
  store: GigStore,
  source: { id: string; priority: number },
  gig: NormalizedGig
): Promise<ProcessGigResult> {
  const venue = await store.upsertVenue(gig);
  const normalizedGig = {
    ...gig,
    venue: {
      ...gig.venue,
      slug: venue.slug
    }
  };
  const reused = await store.tryReuseUnchangedSourceGig({
    sourceId: source.id,
    sourcePriority: source.priority,
    venueId: venue.id,
    gig: normalizedGig
  });

  if (reused) {
    return {
      outcome: "updated",
      gigId: reused.gigId,
      sourceGigId: reused.sourceGigId,
      changed: false
    };
  }

  const existingSourceGig = await store.findSourceGig(
    source.id,
    gig.externalId,
    gig.checksum
  );
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
    gig: normalizedGig,
    venueId: venue.id,
    sourceId: source.id,
    sourcePriority: source.priority
  });
  const sourceGigResult = await store.upsertSourceGig({
    sourceId: source.id,
    gigId: result.gig.id,
    gig: normalizedGig
  });

  return {
    outcome: result.inserted ? "inserted" : "updated",
    gigId: result.gig.id,
    sourceGigId: sourceGigResult.sourceGig.id,
    changed: true
  };
}
