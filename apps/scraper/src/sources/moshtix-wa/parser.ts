import * as cheerio from "cheerio";

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
  type JsonValue,
  type NormalizedGig,
  type NormalizedVenue
} from "@perth-gig-finder/shared";

import {
  createMoshtixDescriptionContext,
  extractMoshtixArtists,
  extractMoshtixArtistsFromContext
} from "./artists";
import { SkipMoshtixListingError } from "./errors";
import { normalizeMoshtixTitle as normalizeTitle } from "./title";
import type {
  MoshtixEventData,
  MoshtixSearchListing,
  MoshtixStructuredAddress,
  MoshtixStructuredEvent,
  ParsedMoshtixSearchPage
} from "./types";

export { extractMoshtixArtists } from "./artists";
export { SkipMoshtixListingError } from "./errors";

const SOURCE_URL = "https://www.moshtix.com.au/v2/search";
const SOURCE_ORIGIN = "https://www.moshtix.com.au";
const PERTH_OFFSET_SUFFIX = "+08:00";
const LIVE_MUSIC_CATEGORY_ID = "2,";
const LIVE_MUSIC_CATEGORY_NUMERIC_ID = 2;
const LOCALITY_NAME_OVERRIDES = new Map([["east freemantle", "East Fremantle"]]);
const PERTH_METRO_LOCALITIES = new Set([
  "perth",
  "east perth",
  "west perth",
  "north perth",
  "northbridge",
  "burswood",
  "subiaco",
  "claremont",
  "mt claremont",
  "mount claremont",
  "nedlands",
  "leederville",
  "mount lawley",
  "inglewood",
  "maylands",
  "highgate",
  "victoria park",
  "como",
  "south perth",
  "fremantle",
  "east fremantle",
  "north fremantle",
  "scarborough",
  "joondalup",
  "cannington",
  "guildford",
  "midland",
  "lathlain"
]);

const NON_MUSIC_KEYWORDS = [
  "trivia",
  "quiz",
  "pub quiz",
  "market",
  "markets",
  "flea market",
  "comedy",
  "workshop",
  "class",
  "classes",
  "karaoke",
  "bingo"
];
const PLACEHOLDER_VENUE_KEYWORDS = [
  "various venues",
  "touring nationally",
  "touring australia",
  "touring australia and new zealand",
  "touring au and nz"
];
const REGIONAL_TITLE_SUFFIX_PATTERN = /\s[-–]\s(?:albany|busselton|rockingham)\b/i;
const EARLY_SKIP_KEYWORD_PATTERNS = [
  /\btrivia\b/i,
  /\bquiz\b/i,
  /\bkaraoke\b/i,
  /\bbingo\b/i,
  /\bcomedy\b/i,
  /\bworkshop(?:s)?\b/i,
  /\bflea market\b/i,
  /\bmarkets?\b/i
];

function getPerthDateParts(date: Date): Record<"day" | "month" | "year", string> {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Perth",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  return formatter.formatToParts(date).reduce<Record<string, string>>((parts, part) => {
    if (part.type === "day" || part.type === "month" || part.type === "year") {
      parts[part.type] = part.value;
    }

    return parts;
  }, {}) as Record<"day" | "month" | "year", string>;
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const withOrigin = normalized.startsWith("//")
    ? `https:${normalized}`
    : normalized.startsWith("/")
      ? new URL(normalized, SOURCE_ORIGIN).toString()
      : normalized;

  const withProtocol = /^https?:\/\//i.test(withOrigin)
    ? withOrigin
    : `https://${withOrigin.replace(/^\/+/, "")}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol === "http:") {
      url.protocol = "https:";
    }

    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return withProtocol;
  }
}

function normalizePerthDateTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const withTimezone =
    normalized.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(normalized)
      ? normalized
      : `${normalized}${PERTH_OFFSET_SUFFIX}`;
  const date = new Date(withTimezone);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Moshtix date: ${value}`);
  }

  return date.toISOString();
}

function parseJsonValue(value: string | null | undefined): JsonValue | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return null;
  }
}

function toStructuredEvent(value: JsonValue | null): MoshtixStructuredEvent | null {
  if (!value) {
    return null;
  }

  const first = Array.isArray(value) ? value[0] : value;

  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return null;
  }

  return first as MoshtixStructuredEvent;
}


function extractExternalId(urlValue: string | null | undefined): string | null {
  if (!urlValue) {
    return null;
  }

  const match = urlValue.match(/\/(\d+)(?:[/?#]|$)/);
  return match?.[1] ?? null;
}

function getPageCount($: cheerio.CheerioAPI): number {
  const pages = $("a[href*='Page=']")
    .map((_, element) => {
      const href = $(element).attr("href") ?? "";
      const match = href.match(/[?&]Page=(\d+)/);
      return match ? Number.parseInt(match[1], 10) : 0;
    })
    .get()
    .filter((value) => Number.isFinite(value) && value > 0);

  return Math.max(1, ...pages);
}


function buildPostalAddress(address: MoshtixStructuredAddress | undefined): string | null {
  if (!address) {
    return null;
  }

  const localityLine = [address.addressLocality, address.addressRegion, address.postalCode]
    .map((value) => normalizeWhitespace(value ?? ""))
    .filter(Boolean)
    .join(" ");
  const fullAddress = [address.streetAddress, localityLine]
    .map((value) => normalizeWhitespace(value ?? ""))
    .filter(Boolean)
    .join(", ");

  return fullAddress || null;
}

function normalizeLocalityName(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value ?? "");
  if (!normalized) {
    return null;
  }

  const identity = normalized.toLowerCase();
  return (
    LOCALITY_NAME_OVERRIDES.get(identity) ??
    identity.replace(/\b[a-z]/g, (character) => character.toUpperCase())
  );
}

function splitVenueNameAndSuburb(
  venueName: string,
  suburb: string | null,
  sourceSuburb = suburb
): { venueName: string; suburb: string | null } {
  if (!suburb) {
    return {
      venueName,
      suburb: null
    };
  }

  let strippedName = venueName;
  const suffixCandidates = [
    ...new Set([sourceSuburb, suburb].filter((value): value is string => Boolean(value)))
  ];
  for (const suffixCandidate of suffixCandidates) {
    const suffixPattern = new RegExp(
      `,\\s*${suffixCandidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
      "i"
    );
    strippedName = strippedName.replace(suffixPattern, "");
  }

  strippedName = normalizeWhitespace(strippedName);

  return {
    venueName: strippedName || venueName,
    suburb
  };
}

function normalizeVenue(input: {
  structuredEvent: MoshtixStructuredEvent | null;
  eventData: MoshtixEventData | null;
}): NormalizedVenue {
  const sourceLocality =
    normalizeWhitespace(input.structuredEvent?.location?.address?.addressLocality ?? "") || null;
  const locality = normalizeLocalityName(sourceLocality);
  const rawVenueName =
    normalizeWhitespace(
      input.structuredEvent?.location?.name ??
        input.eventData?.venue?.name ??
        "Moshtix Venue"
    ) || "Moshtix Venue";
  const { venueName, suburb } = splitVenueNameAndSuburb(rawVenueName, locality, sourceLocality);
  const normalizedVenueName = normalizeVenueName(venueName);

  return {
    name: normalizedVenueName,
    slug: slugifyVenueName(normalizedVenueName),
    suburb: normalizeVenueSuburb(normalizedVenueName, suburb),
    address: normalizeVenueAddress(
      normalizedVenueName,
      buildPostalAddress(input.structuredEvent?.location?.address)
    ),
    websiteUrl: normalizeVenueWebsiteUrl(
      normalizedVenueName,
      normalizeUrl(input.structuredEvent?.location?.sameAs ?? null)
    )
  };
}

function ensurePerthMetroVenue(input: {
  title: string;
  venue: NormalizedVenue;
  structuredEvent: MoshtixStructuredEvent | null;
  eventData: MoshtixEventData | null;
}): void {
  if (REGIONAL_TITLE_SUFFIX_PATTERN.test(input.title)) {
    throw new SkipMoshtixListingError("Moshtix event is outside Perth metro");
  }

  const placeholderHaystack = [
    input.venue.name,
    input.venue.address,
    input.structuredEvent?.location?.name,
    input.eventData?.venue?.name
  ]
    .map((value) => normalizeWhitespace(value ?? "").toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (
    placeholderHaystack &&
    PLACEHOLDER_VENUE_KEYWORDS.some((keyword) => placeholderHaystack.includes(keyword))
  ) {
    throw new SkipMoshtixListingError("Moshtix event uses a placeholder touring venue");
  }

  const region = normalizeWhitespace(
    input.structuredEvent?.location?.address?.addressRegion ??
      input.eventData?.venue?.state ??
      ""
  ).toLowerCase();

  if (region && region !== "wa") {
    throw new SkipMoshtixListingError("Moshtix event is outside WA");
  }

  const localities = [
    input.venue.suburb,
    input.structuredEvent?.location?.address?.addressLocality
  ]
    .map((value) => normalizeWhitespace(value ?? "").toLowerCase())
    .filter(Boolean);

  if (localities.length > 0) {
    if (!localities.some((locality) => PERTH_METRO_LOCALITIES.has(locality))) {
      throw new SkipMoshtixListingError("Moshtix event is outside Perth metro");
    }

    return;
  }

  const locationHaystack = [
    input.venue.name,
    input.venue.address,
    input.structuredEvent?.location?.name
  ]
    .map((value) => normalizeWhitespace(value ?? "").toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (
    !locationHaystack ||
    ![...PERTH_METRO_LOCALITIES].some((locality) => locationHaystack.includes(locality))
  ) {
    throw new SkipMoshtixListingError("Moshtix event is outside Perth metro");
  }
}


function normalizeStatus(input: {
  title: string;
  eventData: MoshtixEventData | null;
  structuredEvent: MoshtixStructuredEvent | null;
  statusText: string | null;
}): GigStatus {
  const haystack = [
    input.title,
    input.eventData?.status,
    input.structuredEvent?.eventStatus,
    input.statusText
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (haystack.includes("cancel")) {
    return "cancelled";
  }

  if (haystack.includes("postpon") || haystack.includes("resched")) {
    return "postponed";
  }

  return "active";
}

function isInvalidMoshtixImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const normalizedPath = url.pathname.replace(/\/+$/, "");

    return normalizedPath === "/uploads";
  } catch {
    return false;
  }
}

function selectImageUrl(...values: Array<string | string[] | null | undefined>): string | null {
  const flattened = values.flatMap((value) =>
    Array.isArray(value) ? value : value ? [value] : []
  );

  for (const candidate of flattened) {
    const normalized = normalizeUrl(candidate);

    if (normalized && !isInvalidMoshtixImageUrl(normalized)) {
      return normalized;
    }
  }

  return null;
}

function isClearlyNonMusicEvent(title: string, description: string | null): boolean {
  const haystack = `${title} ${description ?? ""}`.toLowerCase();

  return NON_MUSIC_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function shouldSkipSearchListingBeforeDetailFetch(
  listing: MoshtixSearchListing
): boolean {
  if (REGIONAL_TITLE_SUFFIX_PATTERN.test(listing.title)) {
    return true;
  }

  const haystack = `${listing.title} ${listing.teaser ?? ""}`;
  return EARLY_SKIP_KEYWORD_PATTERNS.some((pattern) => pattern.test(haystack));
}

function extractEventData(html: string): MoshtixEventData | null {
  const match = html.match(/var moshtixEventData = (\{[\s\S]*?\});/);
  return (parseJsonValue(match?.[1]) as MoshtixEventData | null) ?? null;
}

function createSearchListing(
  $: cheerio.CheerioAPI,
  element: unknown
): MoshtixSearchListing {
  const container = $(element as Parameters<typeof $>[0]);
  const structuredEvent = toStructuredEvent(
    parseJsonValue(container.find("script[type='application/ld+json']").first().html())
  );
  const eventUrl = normalizeUrl(
    container.find("h2.main-event-header a").attr("href") ??
      structuredEvent?.url ??
      container.find("a[href*='/v2/event/']").first().attr("href") ??
      null
  );
  const title = normalizeTitle(
    structuredEvent?.name ?? container.find("h2.main-event-header").text()
  );
  const externalId =
    normalizeWhitespace(container.attr("data-event-id") ?? "") ||
    extractExternalId(eventUrl);

  if (!externalId || !eventUrl || !title) {
    throw new Error("Moshtix search result is missing an id, URL, or title");
  }

  return {
    externalId,
    title,
    eventUrl,
    startsAt: normalizePerthDateTime(structuredEvent?.startDate),
    listingImageUrl: selectImageUrl(
      structuredEvent?.image,
      container.find(".searchresult_image img").attr("src") ?? null
    ),
    teaser: normalizeWhitespace(container.find("p > span").text()) || null,
    rawPayload:
      (structuredEvent
        ? (JSON.parse(JSON.stringify(structuredEvent)) as JsonObject)
        : {}) as JsonObject
  };
}

export function parseMoshtixSearchPage(html: string): ParsedMoshtixSearchPage {
  const $ = cheerio.load(html);
  const listings: MoshtixSearchListing[] = [];
  let failedCount = 0;

  $("div.searchresult.clearfix").each((_, element) => {
    try {
      listings.push(createSearchListing($, element));
    } catch {
      failedCount += 1;
    }
  });

  return {
    listings,
    failedCount,
    totalPages: getPageCount($)
  };
}

export function buildMoshtixWaSearchUrl(now = new Date(), page = 1): string {
  const parts = getPerthDateParts(now);
  const formattedDate = `${parts.day} ${parts.month} ${parts.year}`;
  const params = new URLSearchParams({
    query: "",
    StateId: "8",
    TimePeriod: "6",
    FromDate: formattedDate,
    FromDateDisplay: formattedDate,
    ToDate: "",
    ToDateDisplay: "",
    CategoryList: LIVE_MUSIC_CATEGORY_ID,
    v2: "0"
  });

  if (page > 1) {
    params.set("Page", String(page));
  }

  return `${SOURCE_URL}?${params.toString()}`;
}

export function normalizeMoshtixEventPage(input: {
  listing: MoshtixSearchListing;
  html: string;
}): NormalizedGig {
  const $ = cheerio.load(input.html);
  const eventData = extractEventData(input.html);
  const structuredEvent = toStructuredEvent(
    parseJsonValue($("#event-structured-data-section script[type='application/ld+json']").first().html())
  );
  const title = normalizeTitle(eventData?.name ?? structuredEvent?.name ?? input.listing.title);
  const startsAt =
    normalizePerthDateTime(eventData?.startDate ?? structuredEvent?.startDate) ??
    input.listing.startsAt;

  if (!title || !startsAt) {
    throw new Error("Moshtix event page is missing a title or start time");
  }

  if (
    eventData?.category?.id !== undefined &&
    eventData.category.id !== LIVE_MUSIC_CATEGORY_NUMERIC_ID
  ) {
    throw new SkipMoshtixListingError("Moshtix event is outside the live music category");
  }

  const descriptionHtml = $("#event-details-section .fr-view").html() ?? null;
  const descriptionContext = createMoshtixDescriptionContext(descriptionHtml);
  const description = descriptionContext.plainText ?? input.listing.teaser;

  if (isClearlyNonMusicEvent(title, description)) {
    throw new SkipMoshtixListingError("Moshtix event is clearly non-music");
  }

  const venue = normalizeVenue({ structuredEvent, eventData });
  ensurePerthMetroVenue({ title, venue, structuredEvent, eventData });
  const statusText = normalizeWhitespace($("#status-linked-section").text()) || null;
  const sourceUrl =
    normalizeUrl(
      structuredEvent?.url ??
        $("#event-summary-block").attr("data-event-link") ??
        input.listing.eventUrl
    ) ?? input.listing.eventUrl;
  const artistExtraction = extractMoshtixArtistsFromContext(
    {
      title,
      descriptionHtml,
      structuredEvent,
      eventData,
      venue
    },
    descriptionContext
  );

  return {
    sourceSlug: "moshtix-wa",
    externalId: input.listing.externalId,
    sourceUrl,
    imageUrl: selectImageUrl(
      eventData?.customImage,
      eventData?.highResImage,
      structuredEvent?.image,
      $("#event-summary-thumbnail img").attr("src") ?? null,
      input.listing.listingImageUrl
    ),
    title,
    description,
    status: normalizeStatus({
      title,
      eventData,
      structuredEvent,
      statusText
    }),
    startsAt,
    startsAtPrecision: "exact",
    endsAt: normalizePerthDateTime(eventData?.endDate ?? structuredEvent?.endDate),
    ticketUrl:
      normalizeUrl(
        structuredEvent?.offers?.find((offer) => Boolean(offer.url))?.url ??
          $("a.button_orange").attr("href") ??
          input.listing.eventUrl
      ) ?? input.listing.eventUrl,
    venue,
    artists: artistExtraction.artists,
    artistExtractionKind: artistExtraction.artistExtractionKind,
    rawPayload: JSON.parse(
      JSON.stringify({
        listing: input.listing.rawPayload,
        eventData,
        structuredEvent,
        descriptionHtml
      })
    ) as JsonObject,
    checksum: buildGigChecksum({
      sourceSlug: "moshtix-wa",
      startsAt,
      title,
      venueSlug: venue.slug,
      sourceUrl: input.listing.eventUrl
    })
  };
}

export function repairMoshtixArtists(rawPayload: unknown) {
  const payload =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? (rawPayload as {
          listing?: { name?: string } | null;
          eventData?: MoshtixEventData | null;
          structuredEvent?: MoshtixStructuredEvent | null;
          descriptionHtml?: string | null;
        })
      : {};
  const venue = normalizeVenue({
    structuredEvent: payload.structuredEvent ?? null,
    eventData: payload.eventData ?? null
  });

  return extractMoshtixArtists({
    title: normalizeTitle(
      payload.eventData?.name ??
        payload.structuredEvent?.name ??
        payload.listing?.name ??
        ""
    ),
    descriptionHtml: payload.descriptionHtml ?? null,
    structuredEvent: payload.structuredEvent ?? null,
    eventData: payload.eventData ?? null,
    venue
  });
}
