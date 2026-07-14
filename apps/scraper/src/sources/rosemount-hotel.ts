import * as cheerio from "cheerio";

import {
  buildGigChecksum,
  normalizeVenueName,
  normalizeVenueWebsiteUrl,
  normalizeWhitespace,
  slugifyVenueName,
  type GigStatus,
  type JsonObject,
  type NormalizedGig,
  type NormalizedVenue
} from "@perth-gig-finder/shared";

import { queryAlgolia } from "../algolia";
import { normalizeUtcDate } from "../source-utils/date";
import {
  createBlockHtmlTextContext,
  createHtmlTextContext
} from "../source-utils/html-text";
import type { SourceAdapter, SourceAdapterResult } from "../types";
import {
  extractOztixArtists,
  isMusicGigHit,
  normalizeOztixTitle,
  selectPreferredImageUrl,
  type OztixHit
} from "./oztix-wa";
import { extractOztixArtistsFromContext } from "./oztix-wa/artists";

const SOURCE_URL = "https://rosemounthotel.com.au/live-stuff/";
const REQUEST_TIMEOUT_MS = 15_000;
const ROSEMOUNT_VENUE_SLUGS = new Set([
  "rosemount-hotel",
  "four5nine-bar-rosemount"
]);

interface RosemountSearchConfig {
  appId: string;
  apiKey: string;
  indexName: string;
}

interface AlgoliaResponse {
  results: Array<{
    hits: OztixHit[];
  }>;
}

export function extractRosemountSearchConfig(html: string): RosemountSearchConfig {
  const $ = cheerio.load(html);
  const scriptContents = $("script")
    .map((_, element) => $(element).html() ?? "")
    .get()
    .join("\n");

  const appIdMatch = scriptContents.match(/appId:\s*'([^']+)'/);
  const apiKeyMatch = scriptContents.match(/apiKey:\s*'([^']+)'/);
  const indexMatch = scriptContents.match(/indexName:\s*'([^']+)'/);

  if (!appIdMatch || !apiKeyMatch || !indexMatch) {
    throw new Error("Rosemount Hotel event feed configuration was not found in the page");
  }

  return {
    appId: appIdMatch[1],
    apiKey: apiKeyMatch[1],
    indexName: indexMatch[1]
  };
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const withProtocol = /^https?:\/\//i.test(normalized)
    ? normalized
    : `https://${normalized}`;

  try {
    const url = new URL(withProtocol);

    for (const param of [...url.searchParams.keys()]) {
      if (param.startsWith("utm_")) {
        url.searchParams.delete(param);
      }
    }

    return url.toString();
  } catch {
    return withProtocol;
  }
}

function isRosemountVenueHit(hit: OztixHit): boolean {
  const venueName = normalizeVenueName(normalizeWhitespace(hit.Venue?.Name ?? ""));

  if (!venueName) {
    return false;
  }

  return ROSEMOUNT_VENUE_SLUGS.has(slugifyVenueName(venueName));
}

function normalizeVenue(hit: OztixHit): NormalizedVenue {
  const venue = hit.Venue;
  const venueName = normalizeVenueName(
    normalizeWhitespace(venue?.Name ?? "Rosemount Hotel")
  );

  return {
    name: venueName,
    slug: slugifyVenueName(venueName),
    suburb: venue?.Locality ? normalizeWhitespace(venue.Locality) : "North Perth",
    address: venue?.Address ? normalizeWhitespace(venue.Address) : null,
    websiteUrl: normalizeVenueWebsiteUrl(
      venueName,
      normalizeUrl(venue?.WebsiteUrl) ?? "https://rosemounthotel.com.au/"
    )
  };
}

function normalizeGigStatus(hit: OztixHit, title: string): GigStatus {
  const normalizedTitle = title.toLowerCase();
  const affectedBy = hit.AffectedBy?.toLowerCase() ?? "";

  if (
    hit.IsCancelled ||
    normalizedTitle.startsWith("cancelled -") ||
    affectedBy.includes("cancel")
  ) {
    return "cancelled";
  }

  if (
    hit.IsPostponed ||
    hit.IsRescheduled ||
    normalizedTitle.startsWith("postponed -") ||
    normalizedTitle.startsWith("rescheduled -") ||
    affectedBy.includes("postpon") ||
    affectedBy.includes("resched")
  ) {
    return "postponed";
  }

  return "active";
}

export function normalizeRosemountHit(hit: OztixHit): NormalizedGig {
  const title = normalizeOztixTitle(hit.EventName);
  const startsAt = normalizeUtcDate(
    hit.DateStart,
    "Invalid Rosemount Hotel event date"
  );

  if (!title || !startsAt) {
    throw new Error("Rosemount Hotel hit is missing a title or start time");
  }

  const venue = normalizeVenue(hit);
  const sourceUrl = normalizeUrl(hit.EventUrl) ?? SOURCE_URL;
  const descriptionContext = createBlockHtmlTextContext(hit.EventDescription);
  const specialGuestsText = createHtmlTextContext(hit.SpecialGuests).plainText;
  const description =
    normalizeWhitespace(
      [specialGuestsText, descriptionContext.plainText].filter(Boolean).join(" ")
    ) || null;
  const artistExtraction = extractOztixArtistsFromContext(hit, descriptionContext);
  const rawPayload = JSON.parse(
    JSON.stringify({
      ...hit,
      feedSurface: "live-stuff",
      derivedSourceUrl: sourceUrl
    })
  ) as JsonObject;

  return {
    sourceSlug: "rosemount-hotel",
    externalId: hit.EventGuid?.trim() || null,
    sourceUrl,
    imageUrl: selectPreferredImageUrl(hit),
    title,
    description,
    status: normalizeGigStatus(hit, title),
    startsAt,
    startsAtPrecision: "exact",
    endsAt: normalizeUtcDate(
      hit.DateEnd,
      "Invalid Rosemount Hotel event date"
    ),
    ticketUrl: sourceUrl,
    venue,
    artists: artistExtraction.artists,
    artistExtractionKind: artistExtraction.artistExtractionKind,
    rawPayload,
    checksum: buildGigChecksum({
      sourceSlug: "rosemount-hotel",
      startsAt,
      title,
      venueSlug: venue.slug,
      sourceUrl
    })
  };
}

export function parseRosemountHits(hits: OztixHit[]): SourceAdapterResult {
  const gigs: NormalizedGig[] = [];
  let failedCount = 0;

  for (const hit of hits) {
    if (
      hit.HasEventDatePassed ||
      !isRosemountVenueHit(hit) ||
      !isMusicGigHit(hit)
    ) {
      continue;
    }

    try {
      gigs.push(normalizeRosemountHit(hit));
    } catch {
      failedCount += 1;
    }
  }

  gigs.sort((left, right) =>
    left.startsAt === right.startsAt
      ? left.title.localeCompare(right.title)
      : left.startsAt.localeCompare(right.startsAt)
  );

  return { gigs, failedCount };
}

async function fetchRosemountHits(
  config: RosemountSearchConfig,
  fetchImpl: typeof fetch
): Promise<OztixHit[]> {
  const params = new URLSearchParams({
    hitsPerPage: "1000"
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

export const rosemountHotelSource: SourceAdapter = {
  slug: "rosemount-hotel",
  name: "Rosemount Hotel",
  baseUrl: SOURCE_URL,
  priority: 100,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch) {
    const response = await fetchImpl(SOURCE_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(`Rosemount Hotel page returned status ${response.status}`);
    }

    const config = extractRosemountSearchConfig(await response.text());
    const hits = await fetchRosemountHits(config, fetchImpl);

    return parseRosemountHits(hits);
  },
  repairArtists(rawPayload) {
    return extractOztixArtists(rawPayload as OztixHit);
  }
};
