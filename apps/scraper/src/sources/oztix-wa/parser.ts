import {
  buildGigChecksum,
  normalizeVenueAddress,
  normalizeVenueName,
  normalizeVenueSuburb,
  normalizeVenueWebsiteUrl,
  normalizeWhitespace,
  slugifyVenueName,
  type GigStatus,
  type JsonObject,
  type NormalizedGig,
  type NormalizedVenue
} from "@perth-gig-finder/shared";

import { normalizeUtcDate } from "../../source-utils/date";
import {
  createBlockHtmlTextContext,
  createHtmlTextContext,
  type HtmlTextContext
} from "../../source-utils/html-text";
import type { SourceAdapterResult } from "../../types";
import {
  collectNamedArtists,
  collectStructuredArtists,
  extractOztixArtistsFromContext,
  parseOztixDescriptionArtistsFromContext
} from "./artists";
import { normalizeOztixTitle } from "./title";
import type { OztixHit } from "./types";

export type { OztixHit, OztixPerformance, OztixVenue } from "./types";
export {
  extractOztixArtists,
  parseOztixDescriptionArtists,
  parseOztixSpecialGuests,
  parseOztixTitleFeaturedArtists,
  parseOztixTitleHeadlinerArtists,
  parseOztixTitleLineupArtists,
  parseOztixTitlePresentedArtists,
  parseOztixTitleTrailingWithArtists
} from "./artists";
export { normalizeOztixTitle } from "./title";

const SOURCE_URL = "https://www.oztix.com.au/search?states%5B0%5D=WA&q=";
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

export function selectPreferredImageUrl(hit: OztixHit): string | null {
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


function normalizeCategories(hit: OztixHit): string[] {
  return (Array.isArray(hit.Categories) ? hit.Categories : [])
    .map((category) => normalizeWhitespace(category).toLowerCase())
    .filter(Boolean);
}

function hasExplicitNonGigSignal(
  hit: OztixHit,
  description: string | null
): boolean {
  const title = normalizeWhitespace(hit.EventName ?? "");
  const haystacks = [title, description].filter((value): value is string => Boolean(value));

  return haystacks.some((value) =>
    EXPLICIT_NON_GIG_TEXT_PATTERNS.some((pattern) => pattern.test(value))
  );
}

function hasExplicitMusicSignal(
  hit: OztixHit,
  description: string | null
): boolean {
  const title = normalizeWhitespace(hit.EventName ?? "");
  const haystacks = [title, description].filter((value): value is string => Boolean(value));

  return haystacks.some((value) =>
    EXPLICIT_MUSIC_TEXT_PATTERNS.some((pattern) => pattern.test(value))
  );
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
  return isMusicGigHitWithContext(
    hit,
    createBlockHtmlTextContext(hit.EventDescription)
  );
}

function isMusicGigHitWithContext(
  hit: OztixHit,
  descriptionContext: HtmlTextContext
): boolean {
  const normalizedCategories = normalizeCategories(hit);
  const hasMusicCategory = normalizedCategories.some((category) =>
    MUSIC_CATEGORY_KEYWORDS.some((keyword) => category.includes(keyword))
  );
  const hasNonMusicCategory = normalizedCategories.some((category) =>
    NON_MUSIC_CATEGORY_KEYWORDS.some((keyword) => category.includes(keyword))
  );
  const structuredArtists = collectStructuredArtists(hit);
  const descriptionArtists = parseOztixDescriptionArtistsFromContext(
    descriptionContext
  );
  const namedArtists = collectNamedArtists(hit, descriptionArtists);

  if (
    hasExplicitNonGigSignal(hit, descriptionContext.plainText) &&
    structuredArtists.length === 0
  ) {
    return false;
  }

  if (hasMusicCategory) {
    return true;
  }

  if (hasNonMusicCategory) {
    return (
      structuredArtists.length > 0 &&
      hasExplicitMusicSignal(hit, descriptionContext.plainText)
    );
  }

  return namedArtists.length > 0;
}

function normalizeVenue(hit: OztixHit): NormalizedVenue {
  const venue = hit.Venue;
  const venueName = normalizeVenueName(normalizeWhitespace(venue?.Name ?? "Oztix Venue"));

  return {
    name: venueName,
    slug: slugifyVenueName(venueName),
    suburb: normalizeVenueSuburb(venueName, venue?.Locality),
    address: normalizeVenueAddress(venueName, venue?.Address),
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
  return normalizeOztixHitWithContext(
    hit,
    createBlockHtmlTextContext(hit.EventDescription)
  );
}

function normalizeOztixHitWithContext(
  hit: OztixHit,
  descriptionContext: HtmlTextContext
): NormalizedGig {
  const title = normalizeOztixTitle(hit.EventName);
  const startsAt = normalizeUtcDate(hit.DateStart);

  if (!title || !startsAt) {
    throw new Error("Oztix hit is missing a title or start time");
  }

  const venue = normalizeVenue(hit);
  const sourceUrl = normalizeUrl(hit.EventUrl) ?? SOURCE_URL;
  const specialGuestsText = createHtmlTextContext(hit.SpecialGuests).plainText;
  const description =
    normalizeWhitespace(
      [specialGuestsText, descriptionContext.plainText].filter(Boolean).join(" ")
    ) || null;
  const artistExtraction = extractOztixArtistsFromContext(
    hit,
    descriptionContext
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
    const descriptionContext = createBlockHtmlTextContext(hit.EventDescription);

    if (
      hit.HasEventDatePassed ||
      !isPerthMetroHit(hit) ||
      !isMusicGigHitWithContext(hit, descriptionContext)
    ) {
      continue;
    }

    try {
      gigs.push(normalizeOztixHitWithContext(hit, descriptionContext));
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
