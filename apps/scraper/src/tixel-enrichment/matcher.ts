import {
  areCanonicalTitlesCompatible,
  normalizeTitleForMatch,
  slugifyVenueName
} from "@perth-gig-finder/shared";

import { getPerthDateKey } from "./parser";
import type {
  TixelDiscoveryCard,
  TixelEnrichmentGig,
  TixelEventDetail
} from "./types";

const START_TIME_TOLERANCE_MS = 15 * 60 * 1000;

export interface TixelMatchPlan {
  ambiguousEventUrls: Set<string>;
  matchesByGigId: Map<string, string>;
}

function getTixelEventMatchConfidence(
  gig: TixelEnrichmentGig,
  event: TixelEventDetail
): number {
  if (getPerthDateKey(gig.startsAt) !== event.dateKey) {
    return 0;
  }

  const exactTitle =
    normalizeTitleForMatch(gig.title) === normalizeTitleForMatch(event.title);
  const canonicalTitle = areCanonicalTitlesCompatible(gig.title, event.title);
  const equivalentVenue = haveEquivalentVenues(gig, event);
  const equivalentTime = haveEquivalentStartTimes(gig, event);

  if (exactTitle && equivalentVenue && equivalentTime) {
    return 3;
  }

  if (
    (exactTitle && equivalentTime) ||
    (canonicalTitle && equivalentVenue && equivalentTime)
  ) {
    return 2;
  }

  return exactTitle && equivalentVenue ? 1 : 0;
}

function haveEquivalentVenues(
  gig: TixelEnrichmentGig,
  event: TixelEventDetail
): boolean {
  const eventVenueSlug = slugifyVenueName(event.venueName);
  return (
    eventVenueSlug === gig.venueSlug ||
    eventVenueSlug === slugifyVenueName(gig.venueName)
  );
}

function haveEquivalentStartTimes(
  gig: TixelEnrichmentGig,
  event: TixelEventDetail
): boolean {
  return (
    Math.abs(Date.parse(gig.startsAt) - Date.parse(event.startsAt)) <=
    START_TIME_TOLERANCE_MS
  );
}

export function isTixelEventMatch(
  gig: TixelEnrichmentGig,
  event: TixelEventDetail
): boolean {
  return getTixelEventMatchConfidence(gig, event) > 0;
}

export function isPlausibleTixelDiscoveryCard(
  card: TixelDiscoveryCard,
  gigs: readonly TixelEnrichmentGig[]
): boolean {
  return gigs.some(
    (gig) =>
      getPerthDateKey(gig.startsAt) === card.dateKey &&
      (normalizeTitleForMatch(gig.title) === normalizeTitleForMatch(card.title) ||
        areCanonicalTitlesCompatible(gig.title, card.title))
  );
}

export function matchTixelEvents(
  gigs: readonly TixelEnrichmentGig[],
  events: readonly TixelEventDetail[]
): TixelMatchPlan {
  const eventByUrl = new Map(events.map((event) => [event.url, event]));
  const matchesByGigId = new Map<string, string>();
  const reservedEventUrls = new Set<string>();

  for (const gig of gigs) {
    if (!gig.tixelUrl) {
      continue;
    }

    const event = eventByUrl.get(gig.tixelUrl);

    if (event && isTixelEventMatch(gig, event)) {
      matchesByGigId.set(gig.id, event.url);
      reservedEventUrls.add(event.url);
    }
  }

  const availableGigs = gigs.filter((gig) => !matchesByGigId.has(gig.id));
  const preferredGigIdsByEventUrl = new Map<string, Set<string>>();

  for (const event of events) {
    if (reservedEventUrls.has(event.url)) {
      continue;
    }

    const scoredGigs = availableGigs.map((gig) => ({
      confidence: getTixelEventMatchConfidence(gig, event),
      gigId: gig.id
    }));
    const highestConfidence = Math.max(
      0,
      ...scoredGigs.map((candidate) => candidate.confidence)
    );

    if (highestConfidence > 0) {
      preferredGigIdsByEventUrl.set(
        event.url,
        new Set(
          scoredGigs
            .filter((candidate) => candidate.confidence === highestConfidence)
            .map((candidate) => candidate.gigId)
        )
      );
    }
  }

  const candidateEventUrlsByGigId = new Map<string, Set<string>>();

  for (const [eventUrl, gigIds] of preferredGigIdsByEventUrl) {
    for (const gigId of gigIds) {
      const eventUrls = candidateEventUrlsByGigId.get(gigId) ?? new Set<string>();
      eventUrls.add(eventUrl);
      candidateEventUrlsByGigId.set(gigId, eventUrls);
    }
  }

  const ambiguousEventUrls = new Set<string>();

  for (const [eventUrl, preferredGigIds] of preferredGigIdsByEventUrl) {
    if (preferredGigIds.size !== 1) {
      ambiguousEventUrls.add(eventUrl);
      continue;
    }

    const gigId = [...preferredGigIds][0]!;
    const gigCandidateUrls = candidateEventUrlsByGigId.get(gigId);

    if (gigCandidateUrls?.size !== 1) {
      ambiguousEventUrls.add(eventUrl);
      continue;
    }

    matchesByGigId.set(gigId, eventUrl);
  }

  return { ambiguousEventUrls, matchesByGigId };
}
