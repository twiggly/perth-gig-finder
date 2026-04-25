import * as cheerio from "cheerio";

import {
  buildGigChecksum,
  normalizeVenueName,
  normalizeVenueWebsiteUrl,
  normalizeWhitespace,
  slugifyVenueName,
  type GigStatus,
  type JsonObject,
  type JsonValue,
  type NormalizedGig,
  type NormalizedVenue,
  type StartsAtPrecision
} from "@perth-gig-finder/shared";

import {
  createArtistExtraction,
  hasKnownArtists,
  unknownArtistExtraction
} from "../artist-utils";
import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_ORIGIN = "https://humanitix.com";
const EVENTS_ORIGIN = "https://events.humanitix.com";
const SOURCE_URL = `${SOURCE_ORIGIN}/au/events/au--wa--perth/music`;
const DISCOVERY_URLS = [
  SOURCE_URL,
  `${SOURCE_ORIGIN}/au/events/au--wa--perth/trending--music`
];
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_START_HOUR = 12;
const PERTH_OFFSET_SUFFIX = "+08:00";
const MAX_DISCOVERY_PAGES = 12;
const DETAIL_FETCH_BATCH_SIZE = 8;
const GENERIC_DESCRIPTION_PREFIX = "Get tickets on Humanitix";

const PERTH_METRO_LOCALITIES = new Set([
  "perth",
  "east perth",
  "west perth",
  "north perth",
  "south perth",
  "northbridge",
  "subiaco",
  "claremont",
  "mt claremont",
  "mount claremont",
  "nedlands",
  "crawley",
  "churchlands",
  "leederville",
  "west leederville",
  "mount lawley",
  "highgate",
  "inglewood",
  "maylands",
  "victoria park",
  "east victoria park",
  "lathlain",
  "burswood",
  "como",
  "applecross",
  "bull creek",
  "mosman park",
  "fremantle",
  "east fremantle",
  "north fremantle",
  "hilton",
  "beaconsfield",
  "scarborough",
  "joondalup",
  "guildford",
  "midland",
  "cannington",
  "alkimos",
  "henley brook"
]);

const PERTH_METRO_TOKENS = [
  "perth wa",
  "east perth wa",
  "west perth wa",
  "north perth wa",
  "south perth wa",
  "northbridge wa",
  "subiaco wa",
  "claremont wa",
  "mt claremont wa",
  "mount claremont wa",
  "nedlands wa",
  "crawley wa",
  "churchlands wa",
  "leederville wa",
  "west leederville wa",
  "mount lawley wa",
  "highgate wa",
  "maylands wa",
  "inglewood wa",
  "victoria park wa",
  "east victoria park wa",
  "lathlain wa",
  "burswood wa",
  "como wa",
  "applecross wa",
  "bull creek wa",
  "mosman park wa",
  "fremantle wa",
  "east fremantle wa",
  "north fremantle wa",
  "hilton wa",
  "beaconsfield wa",
  "scarborough wa",
  "joondalup wa",
  "guildford wa",
  "midland wa",
  "cannington wa",
  "alkimos wa",
  "henley brook wa"
];

const HARD_REJECT_TITLE_KEYWORDS = [
  "cocktail night",
  "ecstatic dance",
  "termly catch music",
  "catch music",
  "pitter patter",
  "launch party",
  "bridgerton ball",
  "birthday bash",
  "sound healing",
  "workshop",
  "class",
  "networking"
];

const HARD_REJECT_TEXT_KEYWORDS = [
  "nervous-system reset",
  "dance journey",
  "all ages, abilities, and backgrounds",
  "weekly music sessions",
  "casual attendance",
  "first session is free",
  "carers are welcome",
  "meet new people",
  "food served + mingle",
  "support groups",
  "regular programs include"
];

const MUSIC_SIGNAL_KEYWORDS = [
  "live music",
  "live songs",
  "live in",
  "live at",
  "full band",
  "band",
  "bands",
  "concert",
  "festival",
  "recital",
  "orchestra",
  "quartet",
  "trio",
  "duo",
  "choir",
  "tribute",
  "tour",
  "album launch",
  "single launch",
  "acoustic",
  "musicians",
  "dj set",
  "on the decks",
  "singer-songwriter",
  "singer songwriter",
  "punk",
  "metal",
  "rock",
  "jazz",
  "blues",
  "folk",
  "indie",
  "alternative",
  "hip hop",
  "hip-hop",
  "electronic",
  "techno",
  "house",
  "disco",
  "show"
];

const UI_NOISE_TEXT = new Set([
  "How does it work?",
  "Find events",
  "Host events",
  "Get in touch",
  "Footer information",
  "Location",
  "Refund policy",
  "Hostinformation",
  "More events from this host",
  "Description",
  "Keywords"
]);

const ARTIST_SECTION_HEADINGS = new Set(["lineup", "artists", "performers", "featuring"]);
const HUMANITIX_ARTIST_LIST_SEPARATOR_PATTERN = /\s*(?:,|•|\+|;)\s*/;
const HUMANITIX_TITLE_PLUS_PATTERN = /^(.+?)\s+\+\s+(.+)$/;
const HUMANITIX_TITLE_LAUNCH_PATTERN = /^(.+?)\s+(?:single|ep|album)\s+launch\b/i;
const HUMANITIX_TITLE_SUPPORT_PATTERN =
  /^(.+?)\s+(?:with|w\/)\s+support\s+from\s+(.+)$/i;
const HUMANITIX_TITLE_WITH_LINEUP_PATTERN = /\bw[/.]\s+(.+)$/i;
const HUMANITIX_EXPLICIT_ARTIST_PATTERNS = [
  /\b(?:featuring|feat\.?|ft\.?)\s+(.+?)(?:\s+\/\/|[.!?]|$)/i,
  /\bwith support from\s+(.+?)(?:\s+\/\/|[.!?]|$)/i,
  /\bsupport from\s+(.+?)(?:\s+\/\/|[.!?]|$)/i,
  /\bsupported by\s+(.+?)(?:\s+\/\/|[.!?]|$)/i,
  /\bheadlined by\s+(.+?)(?:\s+\/\/|[.!?]|$)/i,
  /^lineup\s*[:\-]\s*(.+)$/i,
  /^artists?\s*[:\-]\s*(.+)$/i
];
const HUMANITIX_ARTIST_LABEL_PREFIX_PATTERN =
  /^(?:featuring|feat\.?|ft\.?|with support from|support from|supported by|lineup|artists?)\s*[:\-]?\s*/i;
const HUMANITIX_ARTIST_TRAILING_NOISE_PATTERN =
  /\s+(?:and more!?|plus more!?|more to be announced|tba|tbc)$/i;
const HUMANITIX_SONG_CREDIT_CONTEXT_PATTERN =
  /\b(?:catalogue|catalog|hits?|songs?|singles?|tracks?)\b.{0,90}\bincluding\b/i;
const HUMANITIX_GENERIC_ARTIST_WORDS = new Set([
  "plus",
  "band",
  "bands",
  "music",
  "live",
  "alternative",
  "keywords",
  "lineup",
  "artists",
  "description",
  "event",
  "events",
  "performance",
  "play",
  "shows",
  "sound",
  "style",
  "tickets",
  "venue"
]);

interface HumanitixStructuredAddress {
  "@type"?: string | string[];
  streetAddress?: string;
  addressLocality?: string;
  postalCode?: string;
  addressRegion?: string;
  addressCountry?: string;
}

interface HumanitixStructuredPlace {
  "@type"?: string | string[];
  name?: string;
  address?: HumanitixStructuredAddress | string;
  url?: string;
}

interface HumanitixStructuredOffer {
  "@type"?: string | string[];
  url?: string;
  name?: string;
  price?: number | string;
  availability?: string;
}

interface HumanitixStructuredPerformer {
  "@type"?: string | string[];
  name?: string;
  description?: string;
}

interface HumanitixStructuredEvent {
  "@context"?: string;
  "@type"?: string | string[];
  name?: string;
  url?: string;
  startDate?: string;
  endDate?: string;
  location?: HumanitixStructuredPlace | string;
  eventStatus?: string;
  eventAttendanceMode?: string;
  description?: string;
  image?: string | string[];
  offers?: HumanitixStructuredOffer | HumanitixStructuredOffer[];
  performers?: HumanitixStructuredPerformer | HumanitixStructuredPerformer[];
  performer?: HumanitixStructuredPerformer | HumanitixStructuredPerformer[];
}

interface HumanitixPageMeta {
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  twitterLocation: string | null;
  twitterDate: string | null;
  eventId: string | null;
  pageText: string[];
  headings: string[];
  lineupText: string[];
}

export interface ParsedHumanitixDiscoveryPage {
  eventUrls: string[];
  nextPageUrls: string[];
  failedCount: number;
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const withOrigin = trimmed.startsWith("//")
    ? `https:${trimmed}`
    : trimmed.startsWith("/")
      ? new URL(trimmed, SOURCE_ORIGIN).toString()
      : trimmed;

  const withProtocol = /^https?:\/\//i.test(withOrigin)
    ? withOrigin
    : `https://${withOrigin.replace(/^\/+/, "")}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol === "http:") {
      url.protocol = "https:";
    }

    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "hxref" || key === "hxchl") {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return withProtocol;
  }
}

function normalizeEventUrl(value: string | null | undefined): string | null {
  const normalized = normalizeUrl(value);

  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);

    if (url.hostname !== "events.humanitix.com") {
      return null;
    }

    url.search = "";
    url.hash = "";

    const segments = url.pathname.split("/").filter(Boolean);

    if (segments.length !== 1) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function normalizeNextPageUrl(value: string | null | undefined): string | null {
  const normalized = normalizeUrl(value);

  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized, SOURCE_ORIGIN);

    if (!url.hostname.endsWith("humanitix.com")) {
      return null;
    }

    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

function extractPageText($: cheerio.CheerioAPI): string[] {
  const texts = $("main h2, main h3, main h4, main p, main li")
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter((value): value is string => Boolean(value))
    .filter((value) => !UI_NOISE_TEXT.has(value))
    .filter((value) => !/^([A-Z][a-z]{2},?\s+\d{1,2}\s+[A-Z][a-z]{2})/.test(value))
    .filter((value) => !/^(Facebook|Linkedin|X|Copy link|iCal|Google|Office 365|Outlook)/.test(value))
    .filter((value) => !value.startsWith("Tickets for good, not greed"))
    .filter((value) => !/^Refunds? /i.test(value))
    .filter((value) => !/^\$\d+/.test(value));

  return [...new Set(texts)];
}

function extractSectionText($: cheerio.CheerioAPI, headingsToMatch: Set<string>): string[] {
  const values: string[] = [];

  const pushValue = (value: string) => {
    const normalized = normalizeWhitespace(value);

    if (!normalized || UI_NOISE_TEXT.has(normalized)) {
      return;
    }

    values.push(normalized);
  };

  $("main h2, main h3, main h4").each((_, element) => {
    const heading = normalizeWhitespace($(element).text()).toLowerCase();

    if (!headingsToMatch.has(heading)) {
      return;
    }

    let sibling = $(element).next();

    while (sibling.length > 0 && !sibling.is("h2, h3, h4")) {
      if (sibling.is("ul, ol")) {
        sibling.find("li").each((__, listItem) => {
          pushValue($(listItem).text());
        });
      } else {
        const nestedTextNodes = sibling.find("p, li");

        if (nestedTextNodes.length > 0) {
          nestedTextNodes.each((__, node) => {
            pushValue($(node).text());
          });
        } else {
          pushValue(sibling.text());
        }
      }

      sibling = sibling.next();
    }
  });

  return [...new Set(values)];
}

function decodeFrancisEventId(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { itemId?: string | null };
    return parsed.itemId ? normalizeWhitespace(parsed.itemId) : null;
  } catch {
    return null;
  }
}

function getPageMeta($: cheerio.CheerioAPI): HumanitixPageMeta {
  return {
    canonicalUrl:
      normalizeEventUrl($("link[rel='canonical']").attr("href")) ??
      normalizeEventUrl($("meta[property='og:url']").attr("content")) ??
      null,
    ogTitle: normalizeWhitespace($("meta[property='og:title']").attr("content") ?? "") || null,
    ogDescription:
      normalizeWhitespace($("meta[property='og:description']").attr("content") ?? "") || null,
    description:
      normalizeWhitespace($("meta[name='description']").attr("content") ?? "") || null,
    imageUrl:
      normalizeUrl($("meta[name='image']").attr("content")) ??
      normalizeUrl($("meta[property='og:image']").attr("content")) ??
      null,
    twitterLocation:
      normalizeWhitespace($("meta[name='twitter:data1']").attr("content") ?? "") || null,
    twitterDate:
      normalizeWhitespace($("meta[name='twitter:data2']").attr("content") ?? "") || null,
    eventId: decodeFrancisEventId($("meta[name='x-francis']").attr("content") ?? null),
    pageText: extractPageText($),
    headings: $("main h2, main h3, main h4")
      .map((_, element) => normalizeWhitespace($(element).text()))
      .get()
      .filter((value): value is string => Boolean(value)),
    lineupText: extractSectionText($, ARTIST_SECTION_HEADINGS)
  };
}

function flattenJsonLd(value: JsonValue): JsonObject[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => flattenJsonLd(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const object = value as JsonObject;
  const graph = object["@graph"];

  if (Array.isArray(graph)) {
    return [object, ...graph.flatMap((item) => flattenJsonLd(item))];
  }

  return [object];
}

function isEventType(value: string | string[] | undefined): boolean {
  if (!value) {
    return false;
  }

  const values = Array.isArray(value) ? value : [value];
  return values.some((entry) => normalizeWhitespace(entry).toLowerCase() === "event");
}

function toStructuredEvent(value: JsonObject): HumanitixStructuredEvent | null {
  if (!isEventType(value["@type"] as string | string[] | undefined)) {
    return null;
  }

  return value as unknown as HumanitixStructuredEvent;
}

function extractStructuredEvents($: cheerio.CheerioAPI): HumanitixStructuredEvent[] {
  const events: HumanitixStructuredEvent[] = [];

  $("script[type='application/ld+json']").each((_, element) => {
    const content = $(element).html();

    if (!content) {
      return;
    }

    try {
      const parsed = JSON.parse(content) as JsonValue;

      for (const entry of flattenJsonLd(parsed)) {
        const structuredEvent = toStructuredEvent(entry);

        if (structuredEvent) {
          events.push(structuredEvent);
        }
      }
    } catch {
      // Ignore malformed JSON-LD blocks and fall back to the page meta.
    }
  });

  return events;
}

function parseMetaDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const match = value.match(
    /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})/i
  );

  if (!match) {
    return null;
  }

  const [, dayText, monthText, yearText] = match;
  const monthLookup = new Map<string, string>([
    ["january", "01"],
    ["february", "02"],
    ["march", "03"],
    ["april", "04"],
    ["may", "05"],
    ["june", "06"],
    ["july", "07"],
    ["august", "08"],
    ["september", "09"],
    ["october", "10"],
    ["november", "11"],
    ["december", "12"]
  ]);
  const month = monthLookup.get(monthText.toLowerCase());

  if (!month) {
    return null;
  }

  return `${yearText}-${month}-${dayText.padStart(2, "0")}`;
}

function buildFallbackStructuredEvent(meta: HumanitixPageMeta): HumanitixStructuredEvent | null {
  const title = meta.ogTitle;
  const url = meta.canonicalUrl;
  const startDate = parseMetaDate(meta.twitterDate);

  if (!title || !url || !startDate) {
    return null;
  }

  const locationText = meta.twitterLocation ?? "";
  const [venueName, ...addressParts] = locationText.split(",").map((part) => part.trim());
  const localityMatch = locationText.match(/,\s*([^,]+)\s+WA\b/i);
  const postalCodeMatch = locationText.match(/\b(\d{4})\b/);

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: title,
    url,
    startDate,
    description: meta.ogDescription ?? meta.description ?? undefined,
    image: meta.imageUrl ?? undefined,
    location: {
      "@type": "Place",
      name: venueName || undefined,
      address: {
        "@type": "PostalAddress",
        streetAddress: addressParts.join(", ") || undefined,
        addressLocality: localityMatch?.[1] ?? undefined,
        postalCode: postalCodeMatch?.[1] ?? undefined,
        addressRegion: "WA",
        addressCountry: "AU"
      }
    }
  };
}

function normalizeStartDate(
  value: string | null | undefined
): { startsAt: string; startsAtPrecision: StartsAtPrecision } | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T${String(DEFAULT_START_HOUR).padStart(2, "0")}:00:00${PERTH_OFFSET_SUFFIX}`);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid Humanitix start date: ${value}`);
    }

    return {
      startsAt: date.toISOString(),
      startsAtPrecision: "date"
    };
  }

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Humanitix start date: ${value}`);
  }

  return {
    startsAt: date.toISOString(),
    startsAtPrecision: "exact"
  };
}

function normalizeOptionalDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Humanitix end date: ${value}`);
  }

  return date.toISOString();
}

function normalizeEventStatus(value: string | null | undefined, title: string): GigStatus {
  const normalizedValue = (value ?? "").toLowerCase();
  const normalizedTitle = title.toLowerCase();

  if (normalizedValue.includes("eventcancelled") || normalizedTitle.startsWith("cancelled")) {
    return "cancelled";
  }

  if (
    normalizedValue.includes("eventpostponed") ||
    normalizedValue.includes("eventrescheduled") ||
    normalizedTitle.startsWith("postponed")
  ) {
    return "postponed";
  }

  return "active";
}

function normalizeAddress(value: HumanitixStructuredAddress | string | undefined): {
  suburb: string | null;
  address: string | null;
} {
  if (!value) {
    return { suburb: null, address: null };
  }

  if (typeof value === "string") {
    const normalized = normalizeWhitespace(value);
    const localityMatch = normalized.match(/,\s*([^,]+)\s+WA\b/i);

    return {
      suburb: localityMatch ? normalizeWhitespace(localityMatch[1]) : null,
      address: normalized || null
    };
  }

  const streetAddress = normalizeWhitespace(value.streetAddress ?? "") || null;
  const suburb = normalizeWhitespace(value.addressLocality ?? "") || null;
  const region = normalizeWhitespace(value.addressRegion ?? "") || null;
  const postalCode = normalizeWhitespace(value.postalCode ?? "") || null;
  const country = normalizeWhitespace(value.addressCountry ?? "") || null;

  if (streetAddress && /\bwa\b/i.test(streetAddress)) {
    return {
      suburb,
      address: streetAddress
    };
  }

  return {
    suburb,
    address:
      [streetAddress, suburb, region, postalCode, country]
        .filter((part): part is string => Boolean(part))
        .join(", ") || null
  };
}

function normalizeVenue(
  structuredEvent: HumanitixStructuredEvent
): NormalizedVenue {
  const location =
    structuredEvent.location && typeof structuredEvent.location === "object"
      ? structuredEvent.location
      : null;
  const venueName = normalizeVenueName(
    normalizeWhitespace(location?.name ?? "") || "Unknown venue"
  );
  const normalizedAddress = normalizeAddress(location?.address);

  return {
    name: venueName,
    slug: slugifyVenueName(venueName),
    suburb: normalizedAddress.suburb,
    address: normalizedAddress.address,
    websiteUrl: normalizeVenueWebsiteUrl(venueName, normalizeUrl(location?.url) ?? null)
  };
}

function normalizeForKeywordMatch(value: string): string {
  return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildKeywordPattern(keyword: string): RegExp {
  const normalizedKeyword = normalizeForKeywordMatch(keyword);

  if (!normalizedKeyword) {
    return /$a/;
  }

  const escapedKeyword = escapeRegex(normalizedKeyword).replace(/\s+/g, "\\s+");
  return new RegExp(`(?:^|\\b)${escapedKeyword}(?:\\b|$)`, "i");
}

function containsKeyword(haystack: string, keywords: string[]): boolean {
  const normalizedHaystack = normalizeForKeywordMatch(haystack);

  if (!normalizedHaystack) {
    return false;
  }

  return keywords.some((keyword) => buildKeywordPattern(keyword).test(normalizedHaystack));
}

function countKeywordMatches(haystack: string, keywords: string[]): number {
  const normalizedHaystack = normalizeForKeywordMatch(haystack);

  if (!normalizedHaystack) {
    return 0;
  }

  return keywords.filter((keyword) => buildKeywordPattern(keyword).test(normalizedHaystack)).length;
}

function isPerthMetroVenue(structuredEvent: HumanitixStructuredEvent, venue: NormalizedVenue): boolean {
  const location =
    structuredEvent.location && typeof structuredEvent.location === "object"
      ? structuredEvent.location
      : null;
  const normalizedAddress = normalizeAddress(location?.address);
  const suburb = (normalizedAddress.suburb ?? venue.suburb ?? "").toLowerCase();

  if (suburb && PERTH_METRO_LOCALITIES.has(suburb)) {
    return true;
  }

  const haystack = [
    location?.name ?? "",
    venue.name,
    normalizedAddress.address ?? "",
    normalizedAddress.suburb ?? ""
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");

  return PERTH_METRO_TOKENS.some((token) =>
    haystack.includes(token.replace(/[^a-z0-9]+/g, " "))
  );
}

function isOfflineEvent(structuredEvent: HumanitixStructuredEvent): boolean {
  const attendanceMode = normalizeWhitespace(structuredEvent.eventAttendanceMode ?? "").toLowerCase();

  if (attendanceMode.includes("onlineeventattendancemode")) {
    return false;
  }

  const locationName =
    structuredEvent.location && typeof structuredEvent.location === "object"
      ? normalizeWhitespace(structuredEvent.location.name ?? "").toLowerCase()
      : "";

  return !["online", "virtual", "livestream"].some((keyword) =>
    locationName.includes(keyword)
  );
}

function splitArtistNames(value: string): string[] {
  const normalized = value.trim();

  if (!normalized) {
    return [];
  }

  const looksLikeSentenceText =
    /[.?!]/.test(normalized) || /\b(is|are|from|with|presents)\b/i.test(normalized);
  const splitter = looksLikeSentenceText ? /[\n•]+/ : /[\n,•]+/;

  return normalized
    .split(splitter)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
}

function normalizeHumanitixArtistToken(value: string): string {
  return normalizeWhitespace(
    value
      .replace(HUMANITIX_ARTIST_LABEL_PREFIX_PATTERN, "")
      .replace(/^(?:and|&)\s+/i, "")
      .replace(/\s*\/\/\s*[^,;+•]+$/u, "")
      .replace(HUMANITIX_ARTIST_TRAILING_NOISE_PATTERN, "")
      .replace(/^[-–•]+|[-–•]+$/g, "")
  );
}

function splitHumanitixArtistLine(value: string): string[] {
  const normalizedToken = normalizeHumanitixArtistToken(value);
  const normalized = /[,;•+]/.test(normalizedToken)
    ? normalizedToken.replace(/\s+\band\b\s+(?=[^,;•+]+$)/i, ", ")
    : normalizedToken;

  if (!normalized) {
    return [];
  }

  return normalized
    .split(HUMANITIX_ARTIST_LIST_SEPARATOR_PATTERN)
    .map((entry) => normalizeHumanitixArtistToken(entry))
    .filter((entry) => isLikelyArtistName(entry));
}

function isHumanitixSongCreditArtistMatch(value: string, matchIndex: number): boolean {
  const contextBeforeMatch = value.slice(Math.max(0, matchIndex - 140), matchIndex);

  return HUMANITIX_SONG_CREDIT_CONTEXT_PATTERN.test(contextBeforeMatch);
}

function isLikelyArtistName(value: string): boolean {
  if (!value) {
    return false;
  }

  const normalized = normalizeWhitespace(value);
  const normalizedLower = normalized.toLowerCase();

  if (HUMANITIX_GENERIC_ARTIST_WORDS.has(normalizedLower)) {
    return false;
  }

  if (/\b(?:ft|feat|featuring)$/i.test(normalized)) {
    return false;
  }

  if (normalized.length > 80) {
    return false;
  }

  if (/[.?!,]/.test(normalized) || /https?:\/\//i.test(normalized) || /@/.test(normalized)) {
    return false;
  }

  if (
    /\b(?:instagram|website|spotify|facebook|tiktok|ticket|tickets)\b/i.test(
      normalized
    )
  ) {
    return false;
  }

  if (
    /^(?:at|her|his|their|making|listen|tune|style|shows?|music\s+by|carried\s+by)\b/i.test(
      normalized
    )
  ) {
    return false;
  }

  if (
    /\b(?:annual tribute festivals|music blends|gentle guitars|warm harmonies|vivid lyricism|songs explore|heartbreak|healing|popular choice|voice that|town of|city of|wine|coffee|dinner service|bakery|wearables|puzzles|lunch|culture ireland|small projects|liquid architecture|audio foundation|frontrunner av|sponsor|soundwalk|pre-gathering|gathering|playlists|late night set|whimsy|spiralling|bar)\b/i.test(
      normalized
    )
  ) {
    return false;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  if (wordCount > 8) {
    return false;
  }

  return !/\b(is|are|from|with|and carried|writing|performs|presents?|present|hosts?|launch(?:es)?|supported|building|offering|reflects|creating|co-creates|beyond the stage|crowned|journey|grounded|audiences|acclaimed|contemporary|orchestra presents|wide-ranging|repertoire|spanning|classical)\b/i.test(
    normalized
  );
}

function extractStructuredHumanitixArtists(structuredEvent: HumanitixStructuredEvent) {
  const candidates = [
    structuredEvent.performers,
    structuredEvent.performer
  ].flatMap((value) => (Array.isArray(value) ? value : value ? [value] : []));
  const artists: string[] = [];

  for (const performer of candidates) {
    const rawPerformerName = normalizeWhitespace(performer.name ?? "");
    const performerName = normalizeHumanitixArtistToken(rawPerformerName);
    const namesAreInDescription = /\bincluding:?\s*$/i.test(rawPerformerName);

    if (performerName && !namesAreInDescription && isLikelyArtistName(performerName)) {
      artists.push(performerName);
    }

    if (!namesAreInDescription) {
      continue;
    }

    for (const name of splitArtistNames(performer.description ?? "")) {
      if (isLikelyArtistName(name)) {
        artists.push(name);
      }
    }
  }

  return createArtistExtraction(artists, "structured");
}

function parseHumanitixTitleArtists(title: string): string[] {
  const normalized = normalizeWhitespace(title);

  if (!normalized) {
    return [];
  }

  const candidates: string[] = [];
  const plusMatch = normalized.match(HUMANITIX_TITLE_PLUS_PATTERN);

  if (plusMatch) {
    candidates.push(...splitHumanitixArtistLine(`${plusMatch[1]}, ${plusMatch[2]}`));
  }

  const launchMatch = normalized.match(HUMANITIX_TITLE_LAUNCH_PATTERN);

  if (launchMatch) {
    const launchArtist = normalizeHumanitixArtistToken(launchMatch[1]);

    if (isLikelyArtistName(launchArtist)) {
      candidates.push(launchArtist);
    }
  }

  const supportMatch = normalized.match(HUMANITIX_TITLE_SUPPORT_PATTERN);

  if (supportMatch) {
    candidates.push(
      ...splitHumanitixArtistLine(supportMatch[1]),
      ...splitHumanitixArtistLine(supportMatch[2])
    );
  }

  const withLineupMatch = normalized.match(HUMANITIX_TITLE_WITH_LINEUP_PATTERN);

  if (withLineupMatch?.[1]) {
    candidates.push(
      ...splitHumanitixArtistLine(
        withLineupMatch[1]
          .replace(/\s+@\s+.+$/i, "")
          .replace(/\s+&\s+more\b.*$/i, "")
      )
    );
  }

  candidates.push(...parseHumanitixExplicitTextArtists([normalized]));

  return candidates;
}

function parseHumanitixLineupArtists(lineupText: string[]): string[] {
  const candidates: string[] = [];
  let sawExplicitLineupSignal = false;

  for (const line of lineupText) {
    const normalizedLine = normalizeWhitespace(line);

    if (!normalizedLine) {
      continue;
    }

    const hasExplicitLabel = HUMANITIX_ARTIST_LABEL_PREFIX_PATTERN.test(normalizedLine);

    if (hasExplicitLabel) {
      sawExplicitLineupSignal = true;
      candidates.push(...splitHumanitixArtistLine(normalizedLine));
      continue;
    }

    if (/[:,;+]/.test(normalizedLine)) {
      const parsedArtists = splitHumanitixArtistLine(normalizedLine);

      if (parsedArtists.length >= 2) {
        sawExplicitLineupSignal = true;
        candidates.push(...parsedArtists);
      }

      continue;
    }

    if (isLikelyArtistName(normalizedLine)) {
      candidates.push(normalizedLine);
    }
  }

  const normalizedCandidates = createArtistExtraction(candidates, "parsed_text").artists;

  if (normalizedCandidates.length === 0) {
    return [];
  }

  return sawExplicitLineupSignal || normalizedCandidates.length >= 2
    ? normalizedCandidates
    : [];
}

function parseHumanitixExplicitTextArtists(
  values: Array<string | null | undefined>
): string[] {
  const candidates: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value ?? "");

    if (!normalized) {
      continue;
    }

    for (const pattern of HUMANITIX_EXPLICIT_ARTIST_PATTERNS) {
      const match = normalized.match(pattern);

      if (match?.[1]) {
        if (isHumanitixSongCreditArtistMatch(normalized, match.index ?? 0)) {
          continue;
        }

        candidates.push(...splitHumanitixArtistLine(match[1]));
      }
    }
  }

  return candidates;
}

export function extractHumanitixArtists(input: {
  structuredEvent: HumanitixStructuredEvent;
  title: string;
  description: string | null;
  meta: Pick<HumanitixPageMeta, "pageText" | "headings" | "lineupText">;
}) {
  const structuredExtraction = extractStructuredHumanitixArtists(input.structuredEvent);
  const parsedArtists = [
    ...parseHumanitixTitleArtists(input.title),
    ...parseHumanitixLineupArtists(input.meta.lineupText),
    ...parseHumanitixExplicitTextArtists([input.description, ...input.meta.pageText])
  ];

  if (hasKnownArtists(structuredExtraction)) {
    return createArtistExtraction(
      [...structuredExtraction.artists, ...parsedArtists],
      "structured"
    );
  }

  return parsedArtists.length > 0
    ? createArtistExtraction(parsedArtists, "parsed_text")
    : unknownArtistExtraction();
}

function isGenericDescription(value: string | null | undefined): boolean {
  if (!value) {
    return true;
  }

  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return true;
  }

  return normalized.startsWith(GENERIC_DESCRIPTION_PREFIX);
}

function getPreferredDescription(
  structuredEvent: HumanitixStructuredEvent,
  meta: HumanitixPageMeta
): string | null {
  const structuredDescription = normalizeWhitespace(structuredEvent.description ?? "") || null;

  if (!isGenericDescription(structuredDescription)) {
    return structuredDescription;
  }

  const pageDescription = meta.pageText
    .filter((text) => !/^Select an option/i.test(text))
    .filter((text) => !/^Get tickets$/i.test(text))
    .slice(0, 6)
    .join("\n\n");

  if (pageDescription) {
    return pageDescription;
  }

  const fallbackDescription = meta.ogDescription ?? meta.description;
  return isGenericDescription(fallbackDescription) ? null : fallbackDescription;
}

function isStrictMusicGig(input: {
  title: string;
  description: string | null;
  artists: string[];
  headings: string[];
  pageText: string[];
}): boolean {
  const title = input.title.toLowerCase();
  const description = (input.description ?? "").toLowerCase();
  const pageText = input.pageText.join(" ").toLowerCase();
  const headings = input.headings.map((heading) => heading.toLowerCase());
  const artistText = input.artists.join(" ").toLowerCase();
  const combined = `${title} ${description} ${pageText} ${artistText}`.trim();

  if (containsKeyword(title, HARD_REJECT_TITLE_KEYWORDS)) {
    return false;
  }

  if (containsKeyword(combined, HARD_REJECT_TEXT_KEYWORDS)) {
    return false;
  }

  const hasLineup = headings.includes("lineup");
  const performerCount = input.artists.length;
  const musicSignalCount = countKeywordMatches(combined, MUSIC_SIGNAL_KEYWORDS);
  const titleSignalCount = countKeywordMatches(title, MUSIC_SIGNAL_KEYWORDS);

  if (hasLineup || performerCount > 0) {
    return true;
  }

  if (titleSignalCount >= 1) {
    return true;
  }

  return musicSignalCount >= 2;
}

function selectImageUrl(...values: Array<string | string[] | null | undefined>): string | null {
  const flattened = values.flatMap((value) =>
    Array.isArray(value) ? value : value ? [value] : []
  );

  for (const candidate of flattened) {
    const normalized = normalizeUrl(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function getTicketUrl(structuredEvent: HumanitixStructuredEvent, sourceUrl: string): string {
  const offers = Array.isArray(structuredEvent.offers)
    ? structuredEvent.offers
    : structuredEvent.offers
      ? [structuredEvent.offers]
      : [];

  for (const offer of offers) {
    const normalized = normalizeUrl(offer.url);

    if (normalized) {
      return normalized;
    }
  }

  return sourceUrl;
}

function buildExternalId(input: {
  pageEventId: string | null;
  sourceUrl: string;
  startsAt: string;
  hasMultipleEvents: boolean;
}): string {
  const pageSlug = new URL(input.sourceUrl).pathname.split("/").filter(Boolean).at(-1) ?? "event";
  const base = input.pageEventId ?? pageSlug;

  if (!input.hasMultipleEvents) {
    return base;
  }

  return `${base}:${input.startsAt}`;
}

export function parseHumanitixDiscoveryPage(html: string): ParsedHumanitixDiscoveryPage {
  const $ = cheerio.load(html);
  const seenEventUrls = new Set<string>();
  const seenNextPageUrls = new Set<string>();
  let failedCount = 0;

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href") ?? null;
    const normalizedEventUrl = normalizeEventUrl(href);

    if (normalizedEventUrl) {
      seenEventUrls.add(normalizedEventUrl);
      return;
    }

    if ((href ?? "").includes("events.humanitix.com")) {
      failedCount += 1;
    }
  });

  $("link[rel='next'], a[rel='next'], a[aria-label='Next'], a[aria-label='next']").each(
    (_, element) => {
      const href = normalizeNextPageUrl($(element).attr("href") ?? null);

      if (href) {
        seenNextPageUrls.add(href);
      }
    }
  );

  return {
    eventUrls: [...seenEventUrls],
    nextPageUrls: [...seenNextPageUrls],
    failedCount
  };
}

export function normalizeHumanitixDetailPage(input: {
  html: string;
  eventUrl: string;
}): NormalizedGig[] {
  const $ = cheerio.load(input.html);
  const meta = getPageMeta($);
  const structuredEvents = extractStructuredEvents($);
  const candidateEvents =
    structuredEvents.length > 0
      ? structuredEvents
      : (() => {
          const fallback = buildFallbackStructuredEvent(meta);
          return fallback ? [fallback] : [];
        })();

  if (candidateEvents.length === 0) {
    throw new Error("Humanitix event page is missing structured event data");
  }

  const gigs: NormalizedGig[] = [];
  const hasMultipleEvents = candidateEvents.length > 1;

  for (const structuredEvent of candidateEvents) {
    const sourceUrl = normalizeEventUrl(structuredEvent.url ?? meta.canonicalUrl ?? input.eventUrl);
    const title = normalizeWhitespace(structuredEvent.name ?? meta.ogTitle ?? "");
    const normalizedStartDate = normalizeStartDate(structuredEvent.startDate);

    if (!sourceUrl || !title || !normalizedStartDate) {
      throw new Error("Humanitix event page is missing a title, URL, or start date");
    }

    const venue = normalizeVenue(structuredEvent);

    if (!isOfflineEvent(structuredEvent) || !isPerthMetroVenue(structuredEvent, venue)) {
      continue;
    }

    const description = getPreferredDescription(structuredEvent, meta);
    const artistExtraction = extractHumanitixArtists({
      structuredEvent,
      title,
      description,
      meta
    });

    if (
      !isStrictMusicGig({
        title,
        description,
        artists: artistExtraction.artists,
        headings: meta.headings,
        pageText: meta.pageText
      })
    ) {
      continue;
    }

    gigs.push({
      sourceSlug: "humanitix-perth-music",
      externalId: buildExternalId({
        pageEventId: meta.eventId,
        sourceUrl,
        startsAt: normalizedStartDate.startsAt,
        hasMultipleEvents
      }),
      sourceUrl,
      imageUrl: selectImageUrl(structuredEvent.image, meta.imageUrl),
      title,
      description,
      status: normalizeEventStatus(structuredEvent.eventStatus, title),
      startsAt: normalizedStartDate.startsAt,
      startsAtPrecision: normalizedStartDate.startsAtPrecision,
      endsAt: normalizeOptionalDate(structuredEvent.endDate),
      ticketUrl: getTicketUrl(structuredEvent, sourceUrl),
      venue,
      artists: artistExtraction.artists,
      artistExtractionKind: artistExtraction.artistExtractionKind,
      rawPayload: JSON.parse(
        JSON.stringify({
          structuredEvent,
          meta: {
            canonicalUrl: meta.canonicalUrl,
            ogTitle: meta.ogTitle,
            ogDescription: meta.ogDescription,
            description: meta.description,
            imageUrl: meta.imageUrl,
            twitterLocation: meta.twitterLocation,
            twitterDate: meta.twitterDate,
            eventId: meta.eventId,
            pageText: meta.pageText,
            headings: meta.headings,
            lineupText: meta.lineupText
          }
        })
      ) as JsonObject,
      checksum: buildGigChecksum({
        sourceSlug: "humanitix-perth-music",
        startsAt: normalizedStartDate.startsAt,
        title,
        venueSlug: venue.slug,
        sourceUrl
      })
    });
  }

  return gigs;
}

async function fetchWithTimeout(fetchImpl: typeof fetch, input: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetchImpl(input, {
      headers: {
        accept: "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Humanitix request timed out: ${input}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const humanitixPerthMusicSource: SourceAdapter = {
  slug: "humanitix-perth-music",
  name: "Humanitix Perth Music",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch): Promise<SourceAdapterResult> {
    const seenDiscoveryUrls = new Set<string>();
    const queuedDiscoveryUrls = [...DISCOVERY_URLS];
    const seenEventUrls = new Set<string>();
    const gigs: NormalizedGig[] = [];
    let failedCount = 0;

    while (queuedDiscoveryUrls.length > 0 && seenDiscoveryUrls.size < MAX_DISCOVERY_PAGES) {
      const discoveryUrl = queuedDiscoveryUrls.shift();

      if (!discoveryUrl || seenDiscoveryUrls.has(discoveryUrl)) {
        continue;
      }

      seenDiscoveryUrls.add(discoveryUrl);

      try {
        const response = await fetchWithTimeout(fetchImpl, discoveryUrl);

        if (!response.ok) {
          throw new Error(
            `Humanitix discovery page returned status ${response.status}: ${discoveryUrl}`
          );
        }

        const parsed = parseHumanitixDiscoveryPage(await response.text());
        failedCount += parsed.failedCount;

        for (const eventUrl of parsed.eventUrls) {
          seenEventUrls.add(eventUrl);
        }

        for (const nextPageUrl of parsed.nextPageUrls) {
          if (!seenDiscoveryUrls.has(nextPageUrl)) {
            queuedDiscoveryUrls.push(nextPageUrl);
          }
        }
      } catch {
        failedCount += 1;
      }
    }

    const eventUrls = [...seenEventUrls];

    for (
      let detailIndex = 0;
      detailIndex < eventUrls.length;
      detailIndex += DETAIL_FETCH_BATCH_SIZE
    ) {
      const batchResults = await Promise.all(
        eventUrls
          .slice(detailIndex, detailIndex + DETAIL_FETCH_BATCH_SIZE)
          .map(async (eventUrl) => {
            try {
              const response = await fetchWithTimeout(fetchImpl, eventUrl);

              if (!response.ok) {
                throw new Error(
                  `Humanitix event page returned status ${response.status}: ${eventUrl}`
                );
              }

              return {
                gigs: normalizeHumanitixDetailPage({
                  html: await response.text(),
                  eventUrl
                }),
                failedCount: 0
              };
            } catch {
              return {
                gigs: [],
                failedCount: 1
              };
            }
          })
      );

      for (const result of batchResults) {
        gigs.push(...result.gigs);
        failedCount += result.failedCount;
      }
    }

    return {
      gigs,
      failedCount
    };
  },
  repairArtists(rawPayload) {
    const payload =
      rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
        ? (rawPayload as {
            structuredEvent?: HumanitixStructuredEvent;
            meta?: Pick<HumanitixPageMeta, "pageText" | "headings" | "lineupText">;
          })
        : {};

    return payload.structuredEvent
      ? extractHumanitixArtists({
          structuredEvent: payload.structuredEvent,
          title: normalizeWhitespace(payload.structuredEvent.name ?? ""),
          description:
            normalizeWhitespace(payload.structuredEvent.description ?? "") || null,
          meta: {
            pageText: payload.meta?.pageText ?? [],
            headings: payload.meta?.headings ?? [],
            lineupText: payload.meta?.lineupText ?? []
          }
        })
      : unknownArtistExtraction();
  }
};
