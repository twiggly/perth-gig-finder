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
  type NormalizedVenue
} from "@perth-gig-finder/shared";

import { createArtistExtraction } from "../artist-utils";
import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_URL = "https://www.moshtix.com.au/v2/search";
const SOURCE_ORIGIN = "https://www.moshtix.com.au";
const PERTH_OFFSET_SUFFIX = "+08:00";
const LIVE_MUSIC_CATEGORY_ID = "2,";
const LIVE_MUSIC_CATEGORY_NUMERIC_ID = 2;
const REQUEST_TIMEOUT_MS = 10_000;
const DETAIL_FETCH_BATCH_SIZE = 12;
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
const MOSHTIX_ARTIST_LIST_SEPARATOR_PATTERN = /\s*(?:\+|,)\s*/;
const MOSHTIX_PLACEHOLDER_ARTIST_PATTERN =
  /^(?:(?:local|more|additional|special)\s+)*(?:support|supports|support acts?)\s*(?:to be announced|tba|tbc)?$|^(?:(?:a|an)\s+)?(?:special\s+)?guests?\s*(?:to be announced|tba|tbc)?$|^(?:secret|mystery)\s+(?:act|artist|guest|set)s?[!.]?$|^(?:more|more\s+(?:acts?|artists?|guests?))[!.]?$|^(?:tba|tbc|to be announced|more\s+(?:tba|tbc|to be announced)|more to be announced)$/i;
const MOSHTIX_ARTIST_LABEL_PREFIX_PATTERN =
  /^(?:(?:with|w[/.]?)\s+)?(?:special\s+)?guests?\s*[:,\-]?\s+/i;
const MOSHTIX_TITLE_FEATURE_PATTERN =
  /^(?:(.+?)\s*[|:-;]\s*)?(?:featuring|feat\.?|ft\.?)\s+(.+)$/i;
const MOSHTIX_TITLE_TRAILING_FEATURE_PATTERN =
  /^(.+?)\s+(?:featuring|feat\.?|ft\.?)\s+(.+)$/i;
const MOSHTIX_TITLE_SUPPORT_PATTERN = /^(.+?)\s+(w[/.]\s*|with\s+)(.+)$/i;
const MOSHTIX_TITLE_WITH_LABEL_LINEUP_PATTERN =
  /\bwith\s+(?:the\s+)?(?:trio|band|artists?|performers?)\s*:\s*(.+)$/i;
const MOSHTIX_TITLE_PLAYED_BY_PATTERN =
  /\bplayed\s+by\s+(.+?)(?:[.!]|$)/i;
const MOSHTIX_TITLE_TOUR_PREFIX_PATTERN = /^(.+?):\s+.+\btour\b/i;
const MOSHTIX_TITLE_REGION_SUFFIX_PATTERN =
  /^(.+?)\s*[-–|]\s*(?:australia|australian|perth|fremantle|wa|world|uk|eu|us|au|nz|\d{4}).*$/i;
const MOSHTIX_TITLE_COUNTRY_SUFFIX_PATTERN =
  /^(.+?)\s+\((?:[A-Z]{2,}|UK|USA|NZ|DK|GER|SWE(?:DEN)?|SWEDEN)\)$/i;
const MOSHTIX_TIME_SUFFIX_PATTERN =
  /\s*[|–-]\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)\b.*$/i;
const MOSHTIX_HEADLINED_BY_PATTERN = /\bheadlined by\s+(.+?)(?:\s+with\b|[.!]|$)/i;
const MOSHTIX_DJ_LAUNCHES_PATTERN = /\b(DJ\s+.+?)\s+launches\b/i;
const MOSHTIX_DJ_LINE_PATTERN = /\bDJS?\s*:\s*(.+)$/i;
const MOSHTIX_DJ_SEGMENT_SEPARATOR_PATTERN = /\s*[🖤🌹•·●▪▫◆◇★☆*]\s*/u;
const MOSHTIX_MADE_UP_OF_PATTERN = /\bmade up of\b\s+(.+?)(?:[.!]|$)/i;
const MOSHTIX_TITLE_DESCRIPTOR_PATTERN =
  /\s+\((?:[A-Z]{2,}|UK|USA|NZ|DK|GER|SWE(?:DEN)?|SWEDEN|Goanna Band)\)\s*$/i;
const MOSHTIX_DESCRIPTION_STOP_WORDS = new Set([
  "ticketing info",
  "tickets",
  "free entry",
  "under 18",
  "valid form of id"
]);

interface MoshtixStructuredAddress {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
}

interface MoshtixStructuredPlace {
  name?: string;
  sameAs?: string;
  address?: MoshtixStructuredAddress;
}

interface MoshtixStructuredPerformer {
  name?: string;
}

interface MoshtixStructuredOffer {
  url?: string;
}

interface MoshtixStructuredEvent {
  "@type"?: string;
  name?: string;
  image?: string | string[];
  url?: string;
  startDate?: string;
  endDate?: string;
  eventStatus?: string;
  location?: MoshtixStructuredPlace;
  offers?: MoshtixStructuredOffer[];
  performers?: MoshtixStructuredPerformer[];
}

interface MoshtixEventData {
  id?: number;
  name?: string;
  startDate?: string;
  endDate?: string;
  status?: string | null;
  client?: {
    name?: string;
  };
  venue?: {
    id?: number;
    name?: string;
    state?: string;
  };
  category?: {
    id?: number;
    name?: string;
  };
  genre?: {
    id?: number;
    name?: string;
  };
  customImage?: string | null;
  highResImage?: string | null;
  artists?: string[];
}

interface MoshtixSearchListing {
  externalId: string;
  title: string;
  eventUrl: string;
  startsAt: string | null;
  listingImageUrl: string | null;
  teaser: string | null;
  rawPayload: JsonObject;
}

interface MoshtixListingFetchResult {
  gig: NormalizedGig | null;
  failedCount: number;
}

export interface ParsedMoshtixSearchPage {
  listings: MoshtixSearchListing[];
  failedCount: number;
  totalPages: number;
}

class SkipMoshtixListingError extends Error {}

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

function toPlainText(html: string | null | undefined): string | null {
  if (!html) {
    return null;
  }

  const text = cheerio.load(`<div>${html}</div>`).text();
  const normalized = normalizeWhitespace(text);
  return normalized.length > 0 ? normalized : null;
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

function normalizeTitle(value: string | null | undefined): string {
  return normalizeWhitespace(value ?? "");
}

function normalizeMoshtixIdentity(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}

function getMoshtixIdentityVariants(value: string | null | undefined): string[] {
  const identity = normalizeMoshtixIdentity(value ?? "");

  if (!identity) {
    return [];
  }

  const compact = identity.replace(/\s+/g, "");
  const variants = [identity, compact];

  if (compact.endsWith("wa")) {
    variants.push(compact.replace(/wa$/, ""));
  } else {
    variants.push(`${compact}wa`);
  }

  return variants;
}

function normalizeMoshtixArtistToken(value: string): string {
  return normalizeWhitespace(
    value
      .replace(/^w[/.]\s*/i, "")
      .replace(MOSHTIX_ARTIST_LABEL_PREFIX_PATTERN, "")
      .replace(MOSHTIX_TIME_SUFFIX_PATTERN, "")
      .replace(/\band more!?$/i, "")
      .replace(/\bwith special guests?.*$/i, "")
      .replace(MOSHTIX_TITLE_DESCRIPTOR_PATTERN, "")
      .replace(/\s*[|:;,-]\s*$/g, "")
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
  );
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

function splitMoshtixArtistList(value: string): string[] {
  const normalized = normalizeMoshtixArtistToken(value);

  if (!normalized) {
    return [];
  }

  return normalized
    .replace(/\s+\band\b\s+/gi, ", ")
    .split(MOSHTIX_ARTIST_LIST_SEPARATOR_PATTERN)
    .map((artist) => normalizeMoshtixArtistToken(artist))
    .filter(Boolean)
    .filter((artist) => !MOSHTIX_PLACEHOLDER_ARTIST_PATTERN.test(artist));
}

function splitMoshtixFeaturedArtistList(value: string): string[] {
  return splitMoshtixArtistList(
    value.replace(/\s+with\s+(?:the\s+)?(?=[A-Z0-9])/g, ", ")
  );
}

function parseMoshtixDjLine(line: string): string[] {
  const match = line.match(MOSHTIX_DJ_LINE_PATTERN);

  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(MOSHTIX_DJ_SEGMENT_SEPARATOR_PATTERN)
    .map((segment) =>
      normalizeMoshtixArtistToken(
        segment.replace(
          /\s*:\s*(?:pre[-\s]?party\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s*[-–]\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|close))?.*$/i,
          ""
        )
      )
    )
    .filter(Boolean)
    .filter((artist) => !MOSHTIX_PLACEHOLDER_ARTIST_PATTERN.test(artist));
}

function extractProminentDescriptionLines(descriptionHtml: string | null | undefined): string[] {
  if (!descriptionHtml) {
    return [];
  }

  const $ = cheerio.load(`<div>${descriptionHtml}</div>`);

  return $("div")
    .children()
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter(Boolean);
}

function parseMoshtixTitleArtists(title: string): string[] {
  const normalized = normalizeTitle(title);

  if (!normalized) {
    return [];
  }

  const candidates: string[] = [];
  const labelLineupMatch = normalized.match(MOSHTIX_TITLE_WITH_LABEL_LINEUP_PATTERN);

  if (labelLineupMatch?.[1]) {
    candidates.push(...splitMoshtixArtistList(labelLineupMatch[1]));
    return candidates;
  }

  const playedByMatch = normalized.match(MOSHTIX_TITLE_PLAYED_BY_PATTERN);

  if (playedByMatch?.[1]) {
    candidates.push(...splitMoshtixArtistList(playedByMatch[1]));
    return candidates;
  }

  const supportMatch = normalized.match(MOSHTIX_TITLE_SUPPORT_PATTERN);

  if (isLikelyMoshtixTitleSupportMatch(supportMatch)) {
    candidates.push(...splitMoshtixArtistList(supportMatch[1]));
    candidates.push(...splitMoshtixArtistList(supportMatch[3]));
    return candidates;
  }

  const trailingFeatureMatch = normalized.match(MOSHTIX_TITLE_TRAILING_FEATURE_PATTERN);

  if (trailingFeatureMatch?.[2]) {
    candidates.push(...splitMoshtixFeaturedArtistList(trailingFeatureMatch[2]));
    return candidates;
  }

  const featureMatch = normalized.match(MOSHTIX_TITLE_FEATURE_PATTERN);

  if (featureMatch) {
    const [, maybeHeadliner, featured] = featureMatch;
    const isSideFeaturePattern = /[;:]\s*(?:featuring|feat\.?|ft\.?)/i.test(normalized);

    if (maybeHeadliner && !isSideFeaturePattern) {
      candidates.push(...splitMoshtixArtistList(maybeHeadliner));
    }

    candidates.push(...splitMoshtixFeaturedArtistList(featured));
  }

  if (normalized.includes(" + ")) {
    candidates.push(...splitMoshtixArtistList(normalized));
  }

  const tourPrefixMatch = normalized.match(MOSHTIX_TITLE_TOUR_PREFIX_PATTERN);
  if (tourPrefixMatch) {
    candidates.push(normalizeMoshtixArtistToken(tourPrefixMatch[1]));
  }

  const regionSuffixMatch = normalized.match(MOSHTIX_TITLE_REGION_SUFFIX_PATTERN);
  if (regionSuffixMatch && /[+,]/.test(regionSuffixMatch[1])) {
    candidates.push(...splitMoshtixArtistList(regionSuffixMatch[1]));
  }

  const countrySuffixMatch = normalized.match(MOSHTIX_TITLE_COUNTRY_SUFFIX_PATTERN);
  if (countrySuffixMatch) {
    candidates.push(normalizeMoshtixArtistToken(countrySuffixMatch[1]));
  }

  return candidates;
}

function isLikelyMoshtixTitleSupportMatch(
  match: RegExpMatchArray | null
): match is RegExpMatchArray {
  if (!match?.[2] || !match[3]) {
    return false;
  }

  if (/^w[/.]/i.test(match[2])) {
    return true;
  }

  return /(?:\+|,|\bmore\b|\bspecial\s+guests?\b|\bsupports?\b|\btba\b|\btbc\b)/i.test(
    match[3]
  );
}

function parseMoshtixDescriptionArtists(descriptionHtml: string | null | undefined): string[] {
  const lines = extractProminentDescriptionLines(descriptionHtml);
  const candidates: string[] = [];

  for (const line of lines.slice(0, 12)) {
    const lowered = line.toLowerCase();

    if (MOSHTIX_DESCRIPTION_STOP_WORDS.has(lowered)) {
      break;
    }

    const isDjLine = MOSHTIX_DJ_LINE_PATTERN.test(line);

    if (!isDjLine && line !== line.replace(MOSHTIX_TIME_SUFFIX_PATTERN, "")) {
      candidates.push(
        ...splitMoshtixArtistList(line.replace(MOSHTIX_TIME_SUFFIX_PATTERN, ""))
      );
    }

    candidates.push(...parseMoshtixDjLine(line));

    const headlinedMatch = line.match(MOSHTIX_HEADLINED_BY_PATTERN);
    if (headlinedMatch) {
      candidates.push(...splitMoshtixArtistList(headlinedMatch[1]));
    }

    const madeUpOfMatch = line.match(MOSHTIX_MADE_UP_OF_PATTERN);
    if (madeUpOfMatch) {
      const madeUpOfArtists = splitMoshtixArtistList(
        madeUpOfMatch[1].replace(
          /^(?:[A-Z][a-z]+(?:\s+[A-Za-z]+){0,2}\s+musicians\s+)/,
          ""
        )
      );

      if (madeUpOfArtists.length >= 2) {
        candidates.push(...madeUpOfArtists);
      }
    }

    const djLaunchesMatch = line.match(MOSHTIX_DJ_LAUNCHES_PATTERN);
    if (djLaunchesMatch) {
      candidates.push(normalizeMoshtixArtistToken(djLaunchesMatch[1]));
    }
  }

  return candidates;
}

function dedupeMoshtixArtistsByIdentity(artists: string[]): string[] {
  const seenIdentities = new Set<string>();
  const dedupedArtists: string[] = [];

  for (const artist of artists) {
    const identity = normalizeMoshtixIdentity(artist);

    if (!identity || seenIdentities.has(identity)) {
      continue;
    }

    seenIdentities.add(identity);
    dedupedArtists.push(artist);
  }

  return dedupedArtists;
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

function splitVenueNameAndSuburb(
  venueName: string,
  suburb: string | null
): { venueName: string; suburb: string | null } {
  if (!suburb) {
    return {
      venueName,
      suburb: null
    };
  }

  const suffixPattern = new RegExp(`,\\s*${suburb.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  const strippedName = normalizeWhitespace(venueName.replace(suffixPattern, ""));

  return {
    venueName: strippedName || venueName,
    suburb
  };
}

function normalizeVenue(input: {
  structuredEvent: MoshtixStructuredEvent | null;
  eventData: MoshtixEventData | null;
}): NormalizedVenue {
  const locality =
    normalizeWhitespace(input.structuredEvent?.location?.address?.addressLocality ?? "") || null;
  const rawVenueName =
    normalizeWhitespace(
      input.structuredEvent?.location?.name ??
        input.eventData?.venue?.name ??
        "Moshtix Venue"
    ) || "Moshtix Venue";
  const { venueName, suburb } = splitVenueNameAndSuburb(rawVenueName, locality);
  const normalizedVenueName = normalizeVenueName(venueName);

  return {
    name: normalizedVenueName,
    slug: slugifyVenueName(normalizedVenueName),
    suburb,
    address: buildPostalAddress(input.structuredEvent?.location?.address),
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

export function extractMoshtixArtists(input: {
  title: string;
  descriptionHtml: string | null;
  structuredEvent: MoshtixStructuredEvent | null;
  eventData: MoshtixEventData | null;
  venue: NormalizedVenue;
}) {
  const venueIdentities = new Set(
    [
      input.venue.name,
      input.eventData?.venue?.name,
      input.eventData?.client?.name,
      input.structuredEvent?.location?.name
    ].flatMap(getMoshtixIdentityVariants)
  );
  const isVenueArtist = (artist: string) =>
    getMoshtixIdentityVariants(artist).some((identity) => venueIdentities.has(identity));
  const isNoisyArtist = (artist: string) => {
    const normalized = artist.toLowerCase();

    return isVenueArtist(artist) || normalized.includes("homepage gallery");
  };

  const candidates = [
    ...(input.eventData?.artists ?? []),
    ...((input.structuredEvent?.performers ?? []).map((performer) => performer.name ?? ""))
  ]
    .map((artist) => normalizeMoshtixArtistToken(artist))
    .filter(Boolean)
    .filter((artist) => !isNoisyArtist(artist));

  const parsedTitleCandidates = parseMoshtixTitleArtists(input.title);
  const parsedDescriptionCandidates = parseMoshtixDescriptionArtists(input.descriptionHtml);
  const parsedCandidates = [...parsedTitleCandidates, ...parsedDescriptionCandidates]
    .map((artist) => normalizeWhitespace(artist))
    .filter(Boolean)
    .filter((artist) => !isNoisyArtist(artist))
    .filter(
      (artist) =>
        candidates.length === 0 ||
        !candidates.some(
          (candidate) =>
            normalizeMoshtixIdentity(artist).startsWith(
              normalizeMoshtixIdentity(candidate)
            ) &&
            /\b(?:tour|album|single|launch|fremantle|perth|solo)\b/i.test(artist)
        )
    );

  if (candidates.length > 0) {
    const normalizedTitle = normalizeTitle(input.title);
    const titleSupportMatch = normalizedTitle.match(MOSHTIX_TITLE_SUPPORT_PATTERN);
    const orderedCandidates = isLikelyMoshtixTitleSupportMatch(titleSupportMatch)
      ? [...parsedTitleCandidates, ...candidates, ...parsedDescriptionCandidates]
      : [...candidates, ...parsedCandidates];

    return createArtistExtraction(
      dedupeMoshtixArtistsByIdentity(orderedCandidates),
      "structured"
    );
  }

  return createArtistExtraction(
    dedupeMoshtixArtistsByIdentity(parsedCandidates),
    "parsed_text"
  );
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

function shouldSkipSearchListingBeforeDetailFetch(listing: MoshtixSearchListing): boolean {
  if (REGIONAL_TITLE_SUFFIX_PATTERN.test(listing.title)) {
    return true;
  }

  const haystack = `${listing.title} ${listing.teaser ?? ""}`;
  return EARLY_SKIP_KEYWORD_PATTERNS.some((pattern) => pattern.test(haystack));
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetchImpl(input, {
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Moshtix request timed out: ${input}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

  const description =
    toPlainText($("#event-details-section .fr-view").html()) ?? input.listing.teaser;
  const descriptionHtml = $("#event-details-section .fr-view").html() ?? null;

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
  const artistExtraction = extractMoshtixArtists({
    title,
    descriptionHtml,
    structuredEvent,
    eventData,
    venue
  });

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

async function fetchSearchPage(
  fetchImpl: typeof fetch,
  page: number,
  now: Date
): Promise<ParsedMoshtixSearchPage> {
  const response = await fetchWithTimeout(fetchImpl, buildMoshtixWaSearchUrl(now, page));

  if (!response.ok) {
    throw new Error(`Moshtix WA search returned status ${response.status} for page ${page}`);
  }

  return parseMoshtixSearchPage(await response.text());
}

async function fetchMoshtixListingDetails(
  fetchImpl: typeof fetch,
  listing: MoshtixSearchListing
): Promise<MoshtixListingFetchResult> {
  try {
    const response = await fetchWithTimeout(fetchImpl, listing.eventUrl);

    if (!response.ok) {
      return {
        gig: null,
        failedCount: 1
      };
    }

    return {
      gig: normalizeMoshtixEventPage({
        listing,
        html: await response.text()
      }),
      failedCount: 0
    };
  } catch (error) {
    if (error instanceof SkipMoshtixListingError) {
      return {
        gig: null,
        failedCount: 0
      };
    }

    return {
      gig: null,
      failedCount: 1
    };
  }
}

export const moshtixWaSource: SourceAdapter = {
  slug: "moshtix-wa",
  name: "Moshtix WA",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch) {
    const gigs: NormalizedGig[] = [];
    const seenEventIds = new Set<string>();
    const now = new Date();
    let failedCount = 0;
    let currentPage = 1;
    let totalPages = 1;

    while (currentPage <= totalPages) {
      const searchPage = await fetchSearchPage(fetchImpl, currentPage, now);
      totalPages = Math.max(totalPages, searchPage.totalPages);
      failedCount += searchPage.failedCount;
      const detailListings: MoshtixSearchListing[] = [];

      for (const listing of searchPage.listings) {
        if (seenEventIds.has(listing.externalId)) {
          continue;
        }

        seenEventIds.add(listing.externalId);

        if (shouldSkipSearchListingBeforeDetailFetch(listing)) {
          continue;
        }

        detailListings.push(listing);
      }

      for (
        let detailIndex = 0;
        detailIndex < detailListings.length;
        detailIndex += DETAIL_FETCH_BATCH_SIZE
      ) {
        const batch = detailListings.slice(
          detailIndex,
          detailIndex + DETAIL_FETCH_BATCH_SIZE
        );
        const batchResults = await Promise.all(
          batch.map((listing) => fetchMoshtixListingDetails(fetchImpl, listing))
        );

        for (const result of batchResults) {
          failedCount += result.failedCount;

          if (result.gig) {
            gigs.push(result.gig);
          }
        }
      }

      currentPage += 1;
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
        payload.eventData?.name ?? payload.structuredEvent?.name ?? payload.listing?.name ?? ""
      ),
      descriptionHtml: payload.descriptionHtml ?? null,
      structuredEvent: payload.structuredEvent ?? null,
      eventData: payload.eventData ?? null,
      venue
    });
  }
};
