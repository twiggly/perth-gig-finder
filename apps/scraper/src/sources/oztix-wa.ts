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

import { createArtistExtraction } from "../artist-utils";
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

const EXPLICIT_NON_GIG_TEXT_PATTERNS = [
  /\bclass(?:es)?\b/i,
  /\bworkshop(?:s)?\b/i,
  /\bmasterclass(?:es)?\b/i,
  /\bintroduction to\b/i,
  /\bhands-on\b/i,
  /\bpanelists?\b/i,
  /\bprofessional development\b/i,
  /\bcheesemaking\b/i,
  /\bmaterials?\s+(?:and|&)\s+ingredients\s+provided\b/i,
  /\btake home everything you make\b/i
];

const EXPLICIT_MUSIC_TEXT_PATTERNS = [
  /\bdj(?:s)?\b/i,
  /\bband(?:s)?\b/i,
  /\btribute\b/i,
  /\bconcert\b/i,
  /\btour\b/i,
  /\bfestival\b/i,
  /\brave\b/i,
  /\blaunch\b/i,
  /\borchestra\b/i,
  /\bchoir\b/i,
  /\bsongbook\b/i,
  /\balbum\b/i,
  /\brock\b/i,
  /\bmetal\b/i,
  /\bpunk\b/i,
  /\bjazz\b/i,
  /\bhip hop\b/i,
  /\bhouse\b/i,
  /\btechno\b/i,
  /\bemo\b/i,
  /\bindie\b/i,
  /\bfolk\b/i,
  /\bblues\b/i,
  /\bcountry\b/i,
  /\bpop\b/i
];

const SPECIAL_GUEST_PREFIX_PATTERN =
  /^(?:with|plus)?\s*special guests?[:,]?\s*|^(?:with|plus)\s+guests?[:,]?\s*|^starring\s+|^featuring\s+|^feat\.?\s+/i;
const GENERIC_SPECIAL_GUEST_PATTERN =
  /^(?:special guests?|guests?)\s*(?:tba|tbc)?$|^(?:tba|tbc|to be announced|more to be announced)$/i;
const SPECIAL_GUEST_SEPARATOR_PATTERN = /\s*(?:,|\+|\^|\||\s-\s)\s*/;

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
  const fromSpecialGuests = parseOztixSpecialGuests(hit.SpecialGuests);

  return [...fromBands, ...fromPerformances, ...fromTourName, ...fromSpecialGuests]
    .map((artist) => normalizeWhitespace(artist))
    .filter(Boolean);
}

function collectStructuredArtists(hit: OztixHit): string[] {
  const fromBands = Array.isArray(hit.Bands) ? hit.Bands : [];
  const fromPerformances = Array.isArray(hit.Performances)
    ? hit.Performances.map((performance) => performance.Name ?? "")
    : [];

  return [...fromBands, ...fromPerformances]
    .map((artist) => normalizeWhitespace(artist))
    .filter(Boolean);
}

function normalizeSpecialGuestToken(value: string): string {
  let normalized = normalizeWhitespace(value);

  while (SPECIAL_GUEST_PREFIX_PATTERN.test(normalized)) {
    normalized = normalizeWhitespace(normalized.replace(SPECIAL_GUEST_PREFIX_PATTERN, ""));
  }

  return normalized.replace(/\s+and\s+/gi, ", ");
}

export function parseOztixSpecialGuests(value: string | null | undefined): string[] {
  const normalized = normalizeSpecialGuestToken(value ?? "").replace(
    /\)\s+(?=[A-Z0-9][A-Z0-9 "'&!./:-]{0,80}\([A-Z]{2,}\))/g,
    "), "
  );

  if (!normalized) {
    return [];
  }

  const candidates = normalized
    .split(SPECIAL_GUEST_SEPARATOR_PATTERN)
    .flatMap((token) => token.split(/\s*,\s*/))
    .map((token) =>
      normalizeWhitespace(token).replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    )
    .filter(Boolean)
    .filter((token) => !GENERIC_SPECIAL_GUEST_PATTERN.test(token));

  return createArtistExtraction(candidates, "parsed_text").artists;
}

function normalizeCategories(hit: OztixHit): string[] {
  return (Array.isArray(hit.Categories) ? hit.Categories : [])
    .map((category) => normalizeWhitespace(category).toLowerCase())
    .filter(Boolean);
}

function hasExplicitNonGigSignal(hit: OztixHit): boolean {
  const title = normalizeWhitespace(hit.EventName ?? "");
  const description = toPlainText(hit.EventDescription);
  const haystacks = [title, description].filter((value): value is string => Boolean(value));

  return haystacks.some((value) =>
    EXPLICIT_NON_GIG_TEXT_PATTERNS.some((pattern) => pattern.test(value))
  );
}

function hasExplicitMusicSignal(hit: OztixHit): boolean {
  const title = normalizeWhitespace(hit.EventName ?? "");
  const description = toPlainText(hit.EventDescription);
  const haystacks = [title, description].filter((value): value is string => Boolean(value));

  return haystacks.some((value) =>
    EXPLICIT_MUSIC_TEXT_PATTERNS.some((pattern) => pattern.test(value))
  );
}

export function extractOztixArtists(hit: OztixHit) {
  const structuredArtists = [
    ...(Array.isArray(hit.Bands) ? hit.Bands : []),
    ...(Array.isArray(hit.Performances)
      ? hit.Performances.map((performance) => performance.Name ?? "")
      : []),
    ...(hit.TourName ? [hit.TourName] : [])
  ]
    .map((artist) => normalizeWhitespace(artist))
    .filter(Boolean);
  const parsedSpecialGuests = parseOztixSpecialGuests(hit.SpecialGuests);
  const combinedArtists = [...structuredArtists, ...parsedSpecialGuests];
  const extractionKind = structuredArtists.length > 0 ? "structured" : "parsed_text";

  return createArtistExtraction(combinedArtists, extractionKind);
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
  const hasMusicCategory = normalizedCategories.some((category) =>
    MUSIC_CATEGORY_KEYWORDS.some((keyword) => category.includes(keyword))
  );
  const hasNonMusicCategory = normalizedCategories.some((category) =>
    NON_MUSIC_CATEGORY_KEYWORDS.some((keyword) => category.includes(keyword))
  );
  const structuredArtists = collectStructuredArtists(hit);
  const parsedArtists = parseOztixSpecialGuests(hit.SpecialGuests);
  const namedArtists = collectNamedArtists(hit);

  if (hasExplicitNonGigSignal(hit) && structuredArtists.length === 0) {
    return false;
  }

  if (hasMusicCategory) {
    return true;
  }

  if (hasNonMusicCategory) {
    return structuredArtists.length > 0 && hasExplicitMusicSignal(hit);
  }

  return namedArtists.length > 0;
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
  const artistExtraction = extractOztixArtists(hit);

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
    artists: artistExtraction.artists,
    artistExtractionKind: artistExtraction.artistExtractionKind,
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
  },
  repairArtists(rawPayload) {
    return extractOztixArtists(rawPayload as OztixHit);
  }
};
