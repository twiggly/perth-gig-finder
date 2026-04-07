import * as cheerio from "cheerio";

import {
  buildGigChecksum,
  normalizeWhitespace,
  slugify,
  type GigStatus,
  type JsonObject,
  type NormalizedGig,
  type NormalizedVenue
} from "@perth-gig-finder/shared";

import { queryAlgolia } from "../algolia";
import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_URL = "https://milkbarperth.com.au/gigs/";

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

function toPlainText(html: string | null | undefined): string | null {
  if (!html) {
    return null;
  }

  const text = cheerio.load(`<div>${html}</div>`).text();
  const normalized = normalizeWhitespace(text);
  return normalized.length > 0 ? normalized : null;
}

function normalizeUtcDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const withTimezone =
    value.endsWith("Z") || value.includes("+") ? value : `${value}Z`;
  const date = new Date(withTimezone);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid event date: ${value}`);
  }

  return date.toISOString();
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

function normalizeArtists(hit: MilkBarHit): string[] {
  const fromBands = Array.isArray(hit.Bands) ? hit.Bands : [];
  const fromPerformances = Array.isArray(hit.Performances)
    ? hit.Performances.map((performance) => performance.Name ?? "")
    : [];

  const artists = [...fromBands, ...fromPerformances]
    .map((artist) => normalizeWhitespace(artist))
    .filter(Boolean);

  if (artists.length > 0) {
    return [...new Set(artists)];
  }

  if (hit.EventName) {
    return [normalizeWhitespace(hit.EventName)];
  }

  return [];
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
  const description = toPlainText(
    [hit.SpecialGuests, hit.EventDescription].filter(Boolean).join("\n\n")
  );

  return {
    sourceSlug: "milk-bar",
    externalId: hit.EventGuid?.trim() || null,
    sourceUrl,
    imageUrl: null,
    title,
    description,
    status: normalizeGigStatus(hit, title),
    startsAt,
    endsAt: normalizeUtcDate(hit.DateEnd),
    ticketUrl: sourceUrl,
    venue,
    artists: normalizeArtists(hit),
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

  return { gigs, failedCount };
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
  async fetchListings(fetchImpl = fetch) {
    const response = await fetchImpl(SOURCE_URL);

    if (!response.ok) {
      throw new Error(`Milk Bar page returned status ${response.status}`);
    }

    const html = await response.text();
    const config = extractMilkBarSearchConfig(html);
    const hits = await fetchMilkBarHits(config, fetchImpl);

    return parseMilkBarHits(hits);
  }
};
