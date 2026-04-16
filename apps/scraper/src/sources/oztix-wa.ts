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
import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_URL = "https://www.oztix.com.au/search?states%5B0%5D=WA&q=";
const OZTIX_APP_ID = "ICGFYQWGTD";
const OZTIX_API_KEY = "bc11adffff267d354ad0a04aedebb5b5";
const OZTIX_INDEX_NAME = "prod_oztix_eventguide";
const PERTH_CBD = {
  lat: -31.9523,
  lng: 115.8613
};
const PERTH_METRO_RADIUS_KM = 32;

const MUSIC_CATEGORY_KEYWORDS = [
  "music",
  "pop",
  "dance",
  "electronic",
  "hip hop",
  "house",
  "tech house",
  "techno",
  "indie",
  "alternative",
  "rock",
  "metal",
  "punk",
  "hardcore",
  "emo",
  "folk",
  "country",
  "blues",
  "jazz",
  "soul",
  "funk",
  "disco",
  "reggae",
  "dj"
];

const NON_MUSIC_CATEGORY_KEYWORDS = [
  "comedy",
  "theatre",
  "theater",
  "arts",
  "attractions",
  "cabaret",
  "burlesque",
  "class",
  "classes",
  "membership",
  "memberships",
  "sports",
  "sport",
  "podcast"
];

interface OztixVenue {
  Name?: string;
  Address?: string;
  Locality?: string;
  State?: string;
  WebsiteUrl?: string;
  Timezone?: string;
}

interface OztixPerformance {
  Name?: string;
}

interface OztixHit {
  EventGuid?: string;
  EventName?: string;
  SpecialGuests?: string;
  EventDescription?: string;
  HomepageImage?: string | null;
  EventImage1?: string | null;
  DateStart?: string;
  DateEnd?: string | null;
  EventUrl?: string;
  Categories?: string[];
  _geoloc?: {
    lat?: number;
    lng?: number;
  } | null;
  Venue?: OztixVenue;
  Bands?: string[];
  Performances?: OztixPerformance[];
  TourName?: string | null;
  IsCancelled?: boolean;
  IsPostponed?: boolean;
  IsRescheduled?: boolean;
  AffectedBy?: string | null;
  HasEventDatePassed?: boolean;
}

interface AlgoliaResponse {
  results: Array<{
    hits: OztixHit[];
  }>;
}

function isFiniteCoordinate(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number }
): number {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLng = toRadians(end.lng - start.lng);
  const startLat = toRadians(start.lat);
  const endLat = toRadians(end.lat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
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

function stripImageSizeParams(urlValue: string): string {
  try {
    const url = new URL(urlValue);
    url.searchParams.delete("width");
    url.searchParams.delete("height");
    return url.toString();
  } catch {
    return urlValue;
  }
}

function parseImageArea(urlValue: string): number | null {
  try {
    const url = new URL(urlValue);
    const width = Number(url.searchParams.get("width") ?? "");
    const height = Number(url.searchParams.get("height") ?? "");

    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      return width * height;
    }
  } catch {
    // Ignore malformed URLs and fall back to the candidate ordering.
  }

  return null;
}

function selectPreferredImageUrl(hit: OztixHit): string | null {
  const candidates = [hit.EventImage1, hit.HomepageImage]
    .map((value) => normalizeUrl(value))
    .filter((value): value is string => Boolean(value))
    .map((value) => ({
      area: parseImageArea(value),
      preferred: stripImageSizeParams(value)
    }));

  if (candidates.length === 0) {
    return null;
  }

  const [preferred] = candidates.sort((left, right) => {
    const leftArea = left.area;
    const rightArea = right.area;

    if (leftArea !== null && rightArea !== null && leftArea !== rightArea) {
      return rightArea - leftArea;
    }

    if (leftArea !== null) {
      return -1;
    }

    if (rightArea !== null) {
      return 1;
    }

    return 0;
  });

  return preferred.preferred;
}

function collectNamedArtists(hit: OztixHit): string[] {
  const fromBands = Array.isArray(hit.Bands) ? hit.Bands : [];
  const fromPerformances = Array.isArray(hit.Performances)
    ? hit.Performances.map((performance) => performance.Name ?? "")
    : [];
  const fromTourName = hit.TourName ? [hit.TourName] : [];

  return [...fromBands, ...fromPerformances, ...fromTourName]
    .map((artist) => normalizeWhitespace(artist))
    .filter(Boolean);
}

function normalizeCategories(hit: OztixHit): string[] {
  return (Array.isArray(hit.Categories) ? hit.Categories : [])
    .map((category) => normalizeWhitespace(category).toLowerCase())
    .filter(Boolean);
}

function normalizeArtists(hit: OztixHit): string[] {
  const artists = collectNamedArtists(hit);

  if (artists.length > 0) {
    return [...new Set(artists)];
  }

  if (hit.EventName) {
    return [normalizeWhitespace(hit.EventName)];
  }

  return [];
}

export function isPerthMetroHit(hit: OztixHit): boolean {
  const lat = hit._geoloc?.lat;
  const lng = hit._geoloc?.lng;

  if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
    return false;
  }

  return (
    calculateDistanceKm(PERTH_CBD, {
      lat,
      lng
    }) <= PERTH_METRO_RADIUS_KM
  );
}

export function isMusicGigHit(hit: OztixHit): boolean {
  const normalizedCategories = normalizeCategories(hit);

  if (
    normalizedCategories.some((category) =>
      MUSIC_CATEGORY_KEYWORDS.some((keyword) => category.includes(keyword))
    )
  ) {
    return true;
  }

  if (
    normalizedCategories.some((category) =>
      NON_MUSIC_CATEGORY_KEYWORDS.some((keyword) => category.includes(keyword))
    )
  ) {
    return false;
  }

  return collectNamedArtists(hit).length > 0;
}

function normalizeVenue(hit: OztixHit): NormalizedVenue {
  const venue = hit.Venue;
  const venueName = normalizeVenueName(normalizeWhitespace(venue?.Name ?? "Oztix Venue"));

  return {
    name: venueName,
    slug: slugifyVenueName(venueName),
    suburb: venue?.Locality ? normalizeWhitespace(venue.Locality) : null,
    address: venue?.Address ? normalizeWhitespace(venue.Address) : null,
    websiteUrl: normalizeVenueWebsiteUrl(
      venueName,
      normalizeUrl(venue?.WebsiteUrl)
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

export function normalizeOztixHit(hit: OztixHit): NormalizedGig {
  const title = normalizeWhitespace(hit.EventName ?? "");
  const startsAt = normalizeUtcDate(hit.DateStart);

  if (!title || !startsAt) {
    throw new Error("Oztix hit is missing a title or start time");
  }

  const venue = normalizeVenue(hit);
  const sourceUrl = normalizeUrl(hit.EventUrl) ?? SOURCE_URL;
  const description = toPlainText(
    [hit.SpecialGuests, hit.EventDescription].filter(Boolean).join("\n\n")
  );

  return {
    sourceSlug: "oztix-wa",
    externalId: hit.EventGuid?.trim() || null,
    sourceUrl,
    imageUrl: selectPreferredImageUrl(hit),
    title,
    description,
    status: normalizeGigStatus(hit, title),
    startsAt,
    startsAtPrecision: "exact",
    endsAt: normalizeUtcDate(hit.DateEnd),
    ticketUrl: sourceUrl,
    venue,
    artists: normalizeArtists(hit),
    rawPayload: JSON.parse(JSON.stringify(hit)) as JsonObject,
    checksum: buildGigChecksum({
      sourceSlug: "oztix-wa",
      startsAt,
      title,
      venueSlug: venue.slug,
      sourceUrl
    })
  };
}

export function parseOztixHits(hits: OztixHit[]): SourceAdapterResult {
  const gigs: NormalizedGig[] = [];
  let failedCount = 0;

  for (const hit of hits) {
    if (hit.HasEventDatePassed || !isPerthMetroHit(hit) || !isMusicGigHit(hit)) {
      continue;
    }

    try {
      gigs.push(normalizeOztixHit(hit));
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

async function fetchOztixHits(fetchImpl: typeof fetch): Promise<OztixHit[]> {
  const params = new URLSearchParams({
    hitsPerPage: "1000",
    filters: "Venue.State:WA"
  });

  const response = await queryAlgolia<AlgoliaResponse>(
    {
      appId: OZTIX_APP_ID,
      apiKey: OZTIX_API_KEY,
      indexName: OZTIX_INDEX_NAME,
      params: params.toString()
    },
    fetchImpl
  );

  return response.results[0]?.hits ?? [];
}

export const oztixWaSource: SourceAdapter = {
  slug: "oztix-wa",
  name: "Oztix WA",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch) {
    const hits = await fetchOztixHits(fetchImpl);
    return parseOztixHits(hits);
  }
};
