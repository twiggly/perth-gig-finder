import * as cheerio from "cheerio";

import {
  buildGigChecksum,
  normalizeCanonicalTitleForMatch,
  normalizeWhitespace,
  slugify,
  type GigStatus,
  type JsonObject,
  type NormalizedGig,
  type NormalizedVenue
} from "@perth-gig-finder/shared";

import {
  createArtistExtraction,
  preferArtistDisplayNamesFromTitle
} from "../artist-utils";
import { queryAlgolia } from "../algolia";
import { normalizeUtcDate } from "../source-utils/date";
import {
  createBlockHtmlTextContext,
  type HtmlTextContext
} from "../source-utils/html-text";
import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_URL = "https://milkbarperth.com.au/gigs/";
const MILK_BAR_ARTIST_SEPARATOR_PATTERN = /\s*(?:,|\+|;|•)\s*/u;
const MILK_BAR_FEATURE_PREFIX_PATTERN = /^(?:ft\.?|feat\.?|featuring)\s+/i;
const MILK_BAR_LINEUP_PREFIX_PATTERN =
  /^(?:(?:ft\.?|feat\.?|featuring)|with\s+(?:special\s+guests?|support\s+from)|with)\s*[:,]?\s+/i;
const MILK_BAR_NON_ARTIST_TOKEN_PATTERN =
  /^(?:friday fright night|\((?:perth|wa|australian)\s+debut\))$/i;
const MILK_BAR_STATUS_SUFFIX_PATTERN =
  /\s*[-–—:]?\s*\b(?:sold\s*out|waitlist(?:ed)?|selling\s*fast)\b[!.]?\s*$/i;

interface MilkBarSearchConfig {
  appId: string;
  apiKey: string;
  indexName: string;
  venueName: string;
}

interface MilkBarVenue {
  Name?: string;
  Address?: string;
  Locality?: string;
  WebsiteUrl?: string;
  Timezone?: string;
}

interface MilkBarHit {
  EventGuid?: string;
  EventName?: string;
  SpecialGuests?: string;
  EventDescription?: string;
  DateStart?: string;
  DateEnd?: string | null;
  EventUrl?: string;
  Bands?: string[];
  Performances?: Array<{ Name?: string }>;
  Venue?: MilkBarVenue;
  IsCancelled?: boolean;
  IsPostponed?: boolean;
  IsRescheduled?: boolean;
  AffectedBy?: string | null;
}

interface AlgoliaResponse {
  results: Array<{
    hits: MilkBarHit[];
  }>;
}

export function extractMilkBarSearchConfig(html: string): MilkBarSearchConfig {
  const $ = cheerio.load(html);
  const scriptContents = $("script")
    .map((_, element) => $(element).html() ?? "")
    .get()
    .join("\n");

  const venueMatch = scriptContents.match(/var venueId = "([^"]+)"/);
  const indexMatch = scriptContents.match(/indexName:\s*'([^']+)'/);
  const searchClientMatch = scriptContents.match(
    /algoliasearch\('([^']+)', '([^']+)'\)/
  );

  if (!venueMatch || !indexMatch || !searchClientMatch) {
    throw new Error("Milk Bar event feed configuration was not found in the page");
  }

  return {
    venueName: venueMatch[1],
    indexName: indexMatch[1],
    appId: searchClientMatch[1],
    apiKey: searchClientMatch[2]
  };
}

export function parseMilkBarDescriptionArtists(
  descriptionHtml: string | null | undefined
): string[] {
  return parseMilkBarDescriptionArtistsFromContext(
    createBlockHtmlTextContext(descriptionHtml)
  );
}

function parseMilkBarDescriptionArtistsFromContext(
  descriptionContext: HtmlTextContext
): string[] {
  const artists: string[] = [];

  for (const line of descriptionContext.lines) {
    const tributeCredit = line.match(
      /^[^\p{L}\p{N}]{0,8}(.{2,60}?)\s+[–—-]\s+(?:bringing|delivering|recreating)\b/iu
    );

    if (tributeCredit?.[1]) {
      artists.push(tributeCredit[1]);
    }

    const starring = line.match(
      /\bstarring\s+(?:the\s+\p{L}+\s+)?(.+?)\s+and\s+(?:the\s+\p{L}+\s+)?(.+?)[!.](?:\s|$)/iu
    );

    if (starring?.[1] && starring[2]) {
      artists.push(starring[1], starring[2]);
    }

    const leadVocalist = line.match(
      /\bfeaturing\s+(?:(?:internationally|nationally)\s+renowned\s+)?(?:lead\s+)?vocalist\s+([^,.!]{2,80})/iu
    );

    if (leadVocalist?.[1]) {
      artists.push(leadVocalist[1]);
    }

    const battle = line.match(
      /\bbattle\s+between\s+(?:two\s+[^,]{1,80},\s*)?([^,.]{2,60}?)\s+vs\.?\s+([^,.]{2,60})(?:[,!?.]|$)/iu
    );

    if (battle?.[1] && battle[2]) {
      artists.push(battle[1], battle[2]);
    }

    const matchup = line.match(
      /\bas\s+([^,.]{2,60}?)\s+takes\s+on\s+([^,.]{2,60})(?:[,!?.]|$)/iu
    );

    if (matchup?.[1] && matchup[2]) {
      artists.push(matchup[1], matchup[2]);
    }
  }

  return createArtistExtraction(artists, "explicit_lineup").artists;
}

function normalizeVenue(hit: MilkBarHit): NormalizedVenue {
  const venue = hit.Venue;
  const venueName = normalizeWhitespace(venue?.Name ?? "Milk Bar");

  return {
    name: venueName,
    slug: slugify(venueName),
    suburb: venue?.Locality ? normalizeWhitespace(venue.Locality) : null,
    address: venue?.Address ? normalizeWhitespace(venue.Address) : null,
    websiteUrl: venue?.WebsiteUrl
      ? `https://${venue.WebsiteUrl.replace(/^https?:\/\//, "")}`
      : "https://milkbarperth.com.au"
  };
}

export function extractMilkBarArtists(hit: MilkBarHit) {
  return extractMilkBarArtistsFromContext(
    hit,
    createBlockHtmlTextContext(hit.EventDescription)
  );
}

function extractMilkBarArtistsFromContext(
  hit: MilkBarHit,
  descriptionContext: HtmlTextContext
) {
  const descriptionArtists = parseMilkBarDescriptionArtistsFromContext(
    descriptionContext
  );

  if (descriptionArtists.length > 0) {
    return createArtistExtraction(descriptionArtists, "explicit_lineup");
  }

  const fromBands = Array.isArray(hit.Bands) ? hit.Bands : [];
  const fromPerformances = Array.isArray(hit.Performances)
    ? hit.Performances.map((performance) => performance.Name ?? "")
    : [];
  const structuredArtists = [...fromBands, ...fromPerformances]
    .flatMap((artist) => splitMilkBarArtistToken(artist))
    .filter(Boolean);
  const lineupArtists = splitMilkBarArtistToken(hit.SpecialGuests, true);
  const rawSpecialGuests = normalizeWhitespace(hit.SpecialGuests ?? "");
  const hasExplicitLineupSignal =
    MILK_BAR_LINEUP_PREFIX_PATTERN.test(rawSpecialGuests) ||
    /[,;+•]/u.test(rawSpecialGuests);
  const combinedArtists = preferArtistDisplayNamesFromTitle(
    [
      ...structuredArtists,
      ...(structuredArtists.length === 0 || hasExplicitLineupSignal ? lineupArtists : [])
    ],
    hit.EventName
  );

  if (structuredArtists.length > 0) {
    return createArtistExtraction(combinedArtists, "structured");
  }

  return createArtistExtraction(combinedArtists, "explicit_lineup");
}

function splitMilkBarArtistToken(
  value: string | null | undefined,
  isExplicitLineup = false
): string[] {
  const rawValue = normalizeWhitespace(value ?? "");
  const hasExplicitLineupPrefix =
    isExplicitLineup && MILK_BAR_LINEUP_PREFIX_PATTERN.test(rawValue);
  const normalized = rawValue.replace(
    isExplicitLineup ? MILK_BAR_LINEUP_PREFIX_PATTERN : MILK_BAR_FEATURE_PREFIX_PATTERN,
    ""
  );

  if (!normalized) {
    return [];
  }

  return normalized
    .split(MILK_BAR_ARTIST_SEPARATOR_PATTERN)
    .flatMap((artist) => {
      const trimmed = normalizeWhitespace(artist);

      if (/\s&\s/.test(trimmed)) {
        const parts = trimmed.split(/\s*&\s*/).map(normalizeWhitespace).filter(Boolean);
        const rightPart = parts[parts.length - 1] ?? "";

        if (
          !/^the\s+/i.test(rightPart) &&
          (hasExplicitLineupPrefix || /^[A-Z0-9 '&./-]+$/.test(trimmed))
        ) {
          return parts;
        }
      }

      return [trimmed];
    })
    .map((artist) => normalizeWhitespace(artist))
    .filter(Boolean)
    .filter((artist) => !MILK_BAR_NON_ARTIST_TOKEN_PATTERN.test(artist));
}

function normalizeGigStatus(hit: MilkBarHit, title: string): GigStatus {
  const normalizedTitle = title.toLowerCase();
  const affectedBy = hit.AffectedBy?.toLowerCase() ?? "";

  if (hit.IsCancelled || normalizedTitle.startsWith("cancelled -") || affectedBy.includes("cancel")) {
    return "cancelled";
  }

  if (
    hit.IsPostponed ||
    hit.IsRescheduled ||
    normalizedTitle.startsWith("postponed -") ||
    affectedBy.includes("postpon")
  ) {
    return "postponed";
  }

  return "active";
}

export function normalizeMilkBarHit(hit: MilkBarHit): NormalizedGig {
  const title = normalizeWhitespace(hit.EventName ?? "");
  const startsAt = normalizeUtcDate(hit.DateStart);

  if (!title || !startsAt) {
    throw new Error("Milk Bar hit is missing a title or start time");
  }

  const venue = normalizeVenue(hit);
  const sourceUrl = hit.EventUrl?.trim() || SOURCE_URL;
  const descriptionContext = createBlockHtmlTextContext(hit.EventDescription);
  const specialGuestsText = createBlockHtmlTextContext(hit.SpecialGuests).plainText;
  const description =
    normalizeWhitespace(
      [specialGuestsText, descriptionContext.plainText].filter(Boolean).join(" ")
    ) || null;
  const artistExtraction = extractMilkBarArtistsFromContext(hit, descriptionContext);

  return {
    sourceSlug: "milk-bar",
    externalId: hit.EventGuid?.trim() || null,
    sourceUrl,
    imageUrl: null,
    title,
    description,
    status: normalizeGigStatus(hit, title),
    startsAt,
    startsAtPrecision: "exact",
    endsAt: normalizeUtcDate(hit.DateEnd),
    ticketUrl: sourceUrl,
    venue,
    artists: artistExtraction.artists,
    artistExtractionKind: artistExtraction.artistExtractionKind,
    rawPayload: JSON.parse(JSON.stringify(hit)) as JsonObject,
    checksum: buildGigChecksum({
      sourceSlug: "milk-bar",
      startsAt,
      title,
      venueSlug: venue.slug,
      sourceUrl
    })
  };
}

function getPerthDateKey(value: string): string {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .formatToParts(date)
    .reduce<Record<string, string>>((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function hasTicketStatusSuffix(title: string): boolean {
  return MILK_BAR_STATUS_SUFFIX_PATTERN.test(title);
}

function isPreferredMilkBarStatusDuplicate(
  candidate: NormalizedGig,
  current: NormalizedGig
): boolean {
  const candidateHasStatusSuffix = hasTicketStatusSuffix(candidate.title);
  const currentHasStatusSuffix = hasTicketStatusSuffix(current.title);

  if (candidateHasStatusSuffix !== currentHasStatusSuffix) {
    return !candidateHasStatusSuffix;
  }

  if (candidate.artists.length !== current.artists.length) {
    return candidate.artists.length > current.artists.length;
  }

  return candidate.title.length < current.title.length;
}

function dedupeMilkBarStatusTitleVariants(gigs: NormalizedGig[]): NormalizedGig[] {
  const deduped: NormalizedGig[] = [];
  const indexByKey = new Map<string, number>();

  for (const gig of gigs) {
    const canonicalTitle = normalizeCanonicalTitleForMatch(gig.title);

    if (!canonicalTitle) {
      deduped.push(gig);
      continue;
    }

    const key = `${gig.venue.slug}|${getPerthDateKey(gig.startsAt)}|${canonicalTitle}`;
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      indexByKey.set(key, deduped.length);
      deduped.push(gig);
      continue;
    }

    const existingGig = deduped[existingIndex];

    if (
      existingGig &&
      (hasTicketStatusSuffix(existingGig.title) || hasTicketStatusSuffix(gig.title))
    ) {
      deduped[existingIndex] = isPreferredMilkBarStatusDuplicate(gig, existingGig)
        ? gig
        : existingGig;
      continue;
    }

    deduped.push(gig);
  }

  return deduped;
}

export function parseMilkBarHits(hits: MilkBarHit[]): SourceAdapterResult {
  const gigs: NormalizedGig[] = [];
  let failedCount = 0;

  for (const hit of hits) {
    try {
      gigs.push(normalizeMilkBarHit(hit));
    } catch {
      failedCount += 1;
    }
  }

  return { gigs: dedupeMilkBarStatusTitleVariants(gigs), failedCount };
}

async function fetchMilkBarHits(
  config: MilkBarSearchConfig,
  fetchImpl: typeof fetch
): Promise<MilkBarHit[]> {
  const params = new URLSearchParams({
    facetFilters: JSON.stringify([[`Venue.Name:${config.venueName}`]]),
    hitsPerPage: "48"
  });

  const response = await queryAlgolia<AlgoliaResponse>(
    {
      appId: config.appId,
      apiKey: config.apiKey,
      indexName: config.indexName,
      params: params.toString()
    },
    fetchImpl
  );

  return response.results[0]?.hits ?? [];
}

export const milkBarSource: SourceAdapter = {
  slug: "milk-bar",
  name: "Milk Bar",
  baseUrl: SOURCE_URL,
  priority: 100,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch) {
    const response = await fetchImpl(SOURCE_URL);

    if (!response.ok) {
      throw new Error(`Milk Bar page returned status ${response.status}`);
    }

    const html = await response.text();
    const config = extractMilkBarSearchConfig(html);
    const hits = await fetchMilkBarHits(config, fetchImpl);

    return parseMilkBarHits(hits);
  },
  repairArtists(rawPayload) {
    return extractMilkBarArtists(rawPayload as MilkBarHit);
  }
};
