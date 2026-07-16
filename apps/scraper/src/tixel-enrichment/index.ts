import { mapWithConcurrency } from "../source-utils/concurrency";
import { readPositiveIntegerEnv } from "../source-utils/env";
import {
  isPlausibleTixelDiscoveryCard,
  matchTixelEvents
} from "./matcher";
import {
  getPerthDateKey,
  normalizeTixelEventUrl,
  parseTixelDiscoveryPage,
  parseTixelEventDetail,
  TIXEL_DISCOVERY_URL
} from "./parser";
import {
  fetchTixelHtml,
  type TixelFetch,
  type TixelHtmlResult
} from "./request";
import type {
  TixelDiscoveryCard,
  TixelEnrichmentGig,
  TixelEnrichmentStore,
  TixelEnrichmentSummary,
  TixelEventDetail
} from "./types";

const DISCOVERY_CONCURRENCY = 2;
const DEFAULT_DETAIL_CONCURRENCY = 4;
const MAX_DISCOVERY_PAGES = 50;

type FetchHtml = (url: string) => Promise<TixelHtmlResult>;

export interface EnrichTixelLinksOptions {
  detailConcurrency?: number;
  fetchHtml?: FetchHtml;
  fetchImpl?: TixelFetch;
  now?: Date;
}

interface DetailOutcome {
  event: TixelEventDetail | null;
  requestedUrl: string;
  status: "failed" | "missing" | "verified";
}

function buildDiscoveryPageUrl(page: number): string {
  if (page === 1) {
    return TIXEL_DISCOVERY_URL;
  }

  const url = new URL(TIXEL_DISCOVERY_URL);
  url.searchParams.set("page", String(page));
  return url.href;
}

async function fetchDiscoveryCards(
  fetchHtml: FetchHtml
): Promise<TixelDiscoveryCard[]> {
  const firstResult = await fetchHtml(buildDiscoveryPageUrl(1));

  if (firstResult.status !== "ok") {
    throw new Error("Tixel discovery page was unavailable");
  }

  const firstPage = parseTixelDiscoveryPage(firstResult.html);

  if (firstPage.cards.length === 0) {
    throw new Error("Tixel discovery page contained no event cards");
  }

  if (firstPage.maxPage > MAX_DISCOVERY_PAGES) {
    throw new Error("Tixel discovery pagination exceeded the safety limit");
  }

  const remainingPageNumbers = Array.from(
    { length: firstPage.maxPage - 1 },
    (_, index) => index + 2
  );
  const remainingPages = await mapWithConcurrency(
    remainingPageNumbers,
    DISCOVERY_CONCURRENCY,
    async (pageNumber) => {
      const result = await fetchHtml(buildDiscoveryPageUrl(pageNumber));

      if (result.status !== "ok") {
        throw new Error(`Tixel discovery page ${pageNumber} was unavailable`);
      }

      const page = parseTixelDiscoveryPage(result.html);

      if (page.cards.length === 0) {
        throw new Error(`Tixel discovery page ${pageNumber} contained no event cards`);
      }

      return page.cards;
    }
  );
  const cardsByUrl = new Map<string, TixelDiscoveryCard>();

  for (const card of [firstPage.cards, ...remainingPages].flat()) {
    cardsByUrl.set(card.url, card);
  }

  return [...cardsByUrl.values()];
}

function groupGigsByDate(
  gigs: readonly TixelEnrichmentGig[]
): Map<string, TixelEnrichmentGig[]> {
  const gigsByDate = new Map<string, TixelEnrichmentGig[]>();

  for (const gig of gigs) {
    const dateKey = getPerthDateKey(gig.startsAt);

    if (!dateKey) {
      continue;
    }

    const dateGigs = gigsByDate.get(dateKey) ?? [];
    dateGigs.push(gig);
    gigsByDate.set(dateKey, dateGigs);
  }

  return gigsByDate;
}

async function fetchCandidateDetails(input: {
  candidateUrls: readonly string[];
  concurrency: number;
  fetchHtml: FetchHtml;
}): Promise<DetailOutcome[]> {
  return mapWithConcurrency(
    input.candidateUrls,
    input.concurrency,
    async (requestedUrl): Promise<DetailOutcome> => {
      try {
        const result = await input.fetchHtml(requestedUrl);

        if (result.status === "missing") {
          return { event: null, requestedUrl, status: "missing" };
        }

        const event = parseTixelEventDetail(result.html, result.url);
        return event
          ? { event, requestedUrl, status: "verified" }
          : { event: null, requestedUrl, status: "failed" };
      } catch {
        return { event: null, requestedUrl, status: "failed" };
      }
    }
  );
}

export async function enrichTixelLinks(
  store: TixelEnrichmentStore,
  options: EnrichTixelLinksOptions = {}
): Promise<TixelEnrichmentSummary> {
  const now = options.now ?? new Date();
  const gigs = await store.listUpcomingPublicGigs(now.toISOString());

  if (gigs.length === 0) {
    return {
      ambiguous: 0,
      cleared: 0,
      discovered: 0,
      failed: 0,
      matched: 0,
      unchanged: 0,
      updated: 0,
      verified: 0
    };
  }

  const fetchHtml =
    options.fetchHtml ??
    ((url: string) => fetchTixelHtml(url, { fetchImpl: options.fetchImpl }));
  const cards = await fetchDiscoveryCards(fetchHtml);
  const gigsByDate = groupGigsByDate(gigs);
  const candidateUrls = new Set<string>();

  for (const card of cards) {
    const dateGigs = gigsByDate.get(card.dateKey) ?? [];

    if (isPlausibleTixelDiscoveryCard(card, dateGigs)) {
      candidateUrls.add(card.url);
    }
  }

  for (const gig of gigs) {
    if (gig.tixelUrl && normalizeTixelEventUrl(gig.tixelUrl)) {
      candidateUrls.add(gig.tixelUrl);
    }
  }

  const outcomes = await fetchCandidateDetails({
    candidateUrls: [...candidateUrls],
    concurrency:
      options.detailConcurrency ??
      readPositiveIntegerEnv(
        "TIXEL_ENRICHMENT_CONCURRENCY",
        DEFAULT_DETAIL_CONCURRENCY
      ),
    fetchHtml
  });
  const outcomeByRequestedUrl = new Map(
    outcomes.map((outcome) => [outcome.requestedUrl, outcome])
  );
  const canonicalUrlByRequestedUrl = new Map(
    outcomes.flatMap((outcome) =>
      outcome.event ? [[outcome.requestedUrl, outcome.event.url] as const] : []
    )
  );
  const eventsByUrl = new Map<string, TixelEventDetail>();

  for (const outcome of outcomes) {
    if (outcome.event) {
      eventsByUrl.set(outcome.event.url, outcome.event);
    }
  }

  const matchingGigs = gigs.map((gig) => ({
    ...gig,
    tixelUrl: gig.tixelUrl
      ? (canonicalUrlByRequestedUrl.get(gig.tixelUrl) ?? gig.tixelUrl)
      : null
  }));
  const matchPlan = matchTixelEvents(matchingGigs, [...eventsByUrl.values()]);
  const desiredUrlByGigId = new Map(
    gigs.map((gig) => [gig.id, gig.tixelUrl] as const)
  );

  for (const gig of gigs) {
    if (!gig.tixelUrl) {
      continue;
    }

    const outcome = outcomeByRequestedUrl.get(gig.tixelUrl);

    if (outcome?.status === "missing") {
      desiredUrlByGigId.set(gig.id, null);
    } else if (
      outcome?.status === "verified" &&
      !matchPlan.matchesByGigId.has(gig.id)
    ) {
      desiredUrlByGigId.set(gig.id, null);
    }
  }

  for (const [gigId, url] of matchPlan.matchesByGigId) {
    desiredUrlByGigId.set(gigId, url);
  }

  const changes = gigs.flatMap((gig) => {
    const desiredUrl = desiredUrlByGigId.get(gig.id) ?? null;
    return desiredUrl === gig.tixelUrl
      ? []
      : [{ gigId: gig.id, tixelUrl: desiredUrl }];
  });

  await store.applyTixelUrlChanges(changes);

  return {
    ambiguous: matchPlan.ambiguousEventUrls.size,
    cleared: changes.filter((change) => change.tixelUrl === null).length,
    discovered: cards.length,
    failed: outcomes.filter((outcome) => outcome.status === "failed").length,
    matched: matchPlan.matchesByGigId.size,
    unchanged: gigs.filter(
      (gig) =>
        gig.tixelUrl !== null && desiredUrlByGigId.get(gig.id) === gig.tixelUrl
    ).length,
    updated: changes.filter((change) => change.tixelUrl !== null).length,
    verified: eventsByUrl.size
  };
}

export type {
  TixelEnrichmentGig,
  TixelEnrichmentStore,
  TixelEnrichmentSummary,
  TixelEventDetail,
  TixelUrlChange
} from "./types";
