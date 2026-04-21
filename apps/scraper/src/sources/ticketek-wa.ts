import * as cheerio from "cheerio";

import {
  buildGigChecksum,
  normalizeVenueName,
  normalizeWhitespace,
  slugifyVenueName,
  type GigStatus,
  type JsonObject,
  type NormalizedGig,
  type NormalizedVenue,
  type StartsAtPrecision
} from "@perth-gig-finder/shared";

import { unknownArtistExtraction } from "../artist-utils";
import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_ORIGIN = "https://premier.ticketek.com.au";
const SOURCE_URL = `${SOURCE_ORIGIN}/search/SearchResults.aspx`;
const SEARCH_API_URL = "https://ignition.ticketek.com.au/fanxsearch/api/search";
// Ticketek ships this search API key in its public client bundle.
const SEARCH_API_KEY = "VK5eOlJ1ef6bo4NqwYrDjawoNa3jtrNb1wZuYsb1";
const REGION_COOKIE_NAME = "ticketek.com.au+2";
const REGION_COOKIE_VALUE = "wa";
const PERTH_OFFSET_SUFFIX = "+08:00";
// Ticketek's fetchable search markup exposes dates but not event times, so we
// anchor date-only results to local noon to preserve day-level browsing.
const DEFAULT_START_HOUR = 12;
const MAX_PAGES_PER_QUERY = 3;
const SEARCH_API_PAGE_SIZE = 20;
const SEARCH_API_VISITOR_ID = "123";
const REQUEST_TIMEOUT_MS = 20_000;

const SEARCH_QUERIES = [
  "concerts perth",
  "music perth",
  "live music perth",
  "orchestra perth",
  "band perth",
  "festival perth",
  "rock perth"
];

const PERTH_METRO_TOKENS = [
  "perth, wa",
  "east perth, wa",
  "west perth, wa",
  "north perth, wa",
  "northbridge, wa",
  "burswood, wa",
  "subiaco, wa",
  "claremont, wa",
  "nedlands, wa",
  "leederville, wa",
  "mount lawley, wa",
  "inglewood, wa",
  "maylands, wa",
  "highgate, wa",
  "victoria park, wa",
  "como, wa",
  "south perth, wa",
  "fremantle, wa",
  "north fremantle, wa",
  "scarborough, wa",
  "joondalup, wa",
  "cannington, wa",
  "guildford, wa",
  "midland, wa",
  "perth hills, wa"
];

const MUSIC_VENUE_TOKENS: string[] = [];

const MUSIC_INCLUDE_KEYWORDS = [
  "in concert",
  "band",
  "dj",
  "orchestra",
  "symphony",
  "tribute",
  "festival",
  "concert",
  "rock",
  "metal",
  "punk",
  "jazz",
  "blues",
  "folk",
  "country",
  "hip hop",
  "pop",
  "choir",
  "acoustic"
];

const NON_MUSIC_KEYWORDS = [
  "comedy",
  "theatre",
  "theater",
  "musical",
  "play",
  "opera",
  "ballet",
  "wrestling",
  "boxing",
  "fight night",
  "fight",
  "ufc",
  "sport",
  "sports",
  "racing",
  "family",
  "expo",
  "exhibition",
  "talk",
  "conversation",
  "speaking",
  "seminar",
  "workshop",
  "kids",
  "ice",
  "disney on ice"
];

const EXCLUDED_TITLE_KEYWORDS = [
  "waitlist",
  "gift voucher",
  "gift card",
  "parking",
  "membership",
  "fan to fan"
];

const MONTH_LOOKUP = new Map<string, string>([
  ["jan", "01"],
  ["feb", "02"],
  ["mar", "03"],
  ["apr", "04"],
  ["may", "05"],
  ["jun", "06"],
  ["jul", "07"],
  ["aug", "08"],
  ["sep", "09"],
  ["oct", "10"],
  ["nov", "11"],
  ["dec", "12"]
]);

const TICKETEK_DATE_PATTERN =
  /(?:mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2})\s+([a-z]{3})\s+(\d{4})/i;
interface TicketekSearchListing {
  externalId: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  sourceUrl: string;
  ticketUrl: string;
  imageUrl: string | null;
  locationText: string;
  dateText: string;
  startsAt: string;
  startsAtPrecision: StartsAtPrecision;
  rawPayload: JsonObject;
}

export interface ParsedTicketekSearchPage {
  listings: TicketekSearchListing[];
  failedCount: number;
  totalPages: number;
}

interface TicketekSearchApiResponse {
  paging?: {
    nextPageToken?: string | null;
    hasMore?: boolean | null;
    totalCount?: number | null;
  } | null;
  events?: TicketekSearchApiEvent[] | null;
}

interface TicketekSearchApiEvent {
  id?: string | null;
  title?: string | null;
  subtitle?: string | null;
  dateTimeLocalized?: string | null;
  link?: {
    uri?: string | null;
  } | null;
  show?: {
    showCode?: string | null;
  } | null;
  venue?: {
    name?: string | null;
    city?: string | null;
    state?: string | null;
    venueCode?: string | null;
  } | null;
}

class SkipTicketekListingError extends Error {}

function normalizeAssetUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const withOrigin = trimmed.startsWith("//")
    ? `https:${trimmed}`
    : new URL(trimmed, SOURCE_ORIGIN).toString();

  try {
    const url = new URL(withOrigin);

    if (url.protocol === "http:") {
      url.protocol = "https:";
    }

    return url.toString();
  } catch {
    return withOrigin;
  }
}

function normalizeEventUrl(value: string | null | undefined): string | null {
  const normalizedUrl = normalizeAssetUrl(value);

  if (!normalizedUrl) {
    return null;
  }

  try {
    const url = new URL(normalizedUrl);
    const showId = url.searchParams.get("sh");

    if (!showId) {
      throw new Error(`Ticketek listing URL is missing a show code: ${normalizedUrl}`);
    }

    const venueVariant = url.searchParams.get("v");

    url.pathname = "/Shows/Show.aspx";
    url.search = "";
    url.searchParams.set("sh", showId);

    if (venueVariant) {
      url.searchParams.set("v", venueVariant);
    }

    return url.toString();
  } catch {
    return normalizedUrl;
  }
}

function extractExternalId(urlValue: string): string {
  const url = new URL(urlValue);
  const showId = url.searchParams.get("sh");

  if (!showId) {
    throw new Error(`Ticketek listing URL is missing a show code: ${urlValue}`);
  }

  const venueVariant = url.searchParams.get("v");
  return venueVariant ? `${showId}:${venueVariant}` : showId;
}

function buildTicketekSearchUrl(query: string, page: number): string {
  const url = new URL(SOURCE_URL);
  url.searchParams.set("k", query);
  url.searchParams.set("page", String(page));
  return url.toString();
}

function parseSetCookieValue(headerValue: string): [string, string] | null {
  const [cookiePart] = headerValue.split(";", 1);

  if (!cookiePart) {
    return null;
  }

  const separatorIndex = cookiePart.indexOf("=");

  if (separatorIndex <= 0) {
    return null;
  }

  const name = cookiePart.slice(0, separatorIndex).trim();
  const value = cookiePart.slice(separatorIndex + 1).trim();

  if (!name) {
    return null;
  }

  return [name, value];
}

function updateCookieJar(cookieJar: Map<string, string>, response: Response): void {
  const getSetCookie =
    "getSetCookie" in response.headers &&
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  for (const headerValue of getSetCookie) {
    const parsed = parseSetCookieValue(headerValue);

    if (!parsed) {
      continue;
    }

    const [name, value] = parsed;
    cookieJar.set(name, value);
  }
}

function buildCookieHeader(cookieJar: Map<string, string>): string | null {
  if (cookieJar.size === 0) {
    return null;
  }

  return [...cookieJar.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function createTicketekCookieJar(): Map<string, string> {
  return new Map([[REGION_COOKIE_NAME, REGION_COOKIE_VALUE]]);
}

async function fetchTicketekPageHtml(
  url: string,
  fetchImpl: typeof fetch,
  cookieJar: Map<string, string>
): Promise<string> {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount < 6; redirectCount += 1) {
    const cookieHeader = buildCookieHeader(cookieJar);
    const response = await fetchImpl(currentUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-AU,en;q=0.9",
        ...(cookieHeader ? { cookie: cookieHeader } : {})
      },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    updateCookieJar(cookieJar, response);

    if (
      response.status === 301 ||
      response.status === 302 ||
      response.status === 303 ||
      response.status === 307 ||
      response.status === 308
    ) {
      const location = response.headers.get("location");

      if (!location) {
        throw new Error(`Ticketek redirect was missing a location for ${currentUrl}`);
      }

      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return await response.text();
  }

  throw new Error(`Ticketek request exceeded redirect limit for ${url}`);
}

function detectFrontdoorPage(html: string): boolean {
  const haystack = html.toLowerCase();
  return (
    (haystack.includes("ticketek australia") &&
      haystack.includes("just one device") &&
      haystack.includes("security flags")) ||
    haystack.includes("something doesn't feel quite right") ||
    haystack.includes("temporarily keeping you from accessing our site") ||
    haystack.includes("powered and protected by privacy")
  );
}

function buildStartsAtFromDateText(dateText: string): string {
  const normalizedDateText = normalizeWhitespace(dateText);

  if (normalizedDateText.toLowerCase() === "tbc") {
    throw new SkipTicketekListingError("Ticketek listing does not expose a schedulable date yet");
  }

  const match = normalizedDateText.match(TICKETEK_DATE_PATTERN);

  if (!match) {
    throw new Error(`Ticketek date could not be parsed: ${dateText}`);
  }

  const [, day, month, year] = match;
  const normalizedMonth = MONTH_LOOKUP.get(month.toLowerCase());

  if (!normalizedMonth) {
    throw new Error(`Ticketek date used an unknown month: ${dateText}`);
  }

  return new Date(
    `${year}-${normalizedMonth}-${day.padStart(2, "0")}T${String(DEFAULT_START_HOUR).padStart(2, "0")}:00:00${PERTH_OFFSET_SUFFIX}`
  ).toISOString();
}

function extractDateKey(value: string): string | null {
  const normalizedValue = normalizeWhitespace(value);
  const match = normalizedValue.match(TICKETEK_DATE_PATTERN);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  const normalizedMonth = MONTH_LOOKUP.get(month.toLowerCase());

  if (!normalizedMonth) {
    return null;
  }

  return `${year}-${normalizedMonth}-${day.padStart(2, "0")}`;
}

export function buildTicketekExactTimeLookupKey(input: {
  externalId: string;
  dateKey: string;
  venueSlug: string;
}): string {
  return `${input.externalId}|${input.dateKey}|${input.venueSlug}`;
}

function buildTicketekVenueSlug(value: string): string {
  return slugifyVenueName(normalizeVenueName(value));
}

function normalizeApiStartsAt(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const startsAt = new Date(value);

  if (Number.isNaN(startsAt.valueOf())) {
    return null;
  }

  return startsAt.toISOString();
}

function extractVenueCodeFromEventLink(urlValue: string | null | undefined): string | null {
  if (!urlValue) {
    return null;
  }

  try {
    const url = new URL(urlValue, SOURCE_ORIGIN);
    const match = url.pathname.match(/\/venues\/([^/]+)/i);

    if (!match?.[1]) {
      return null;
    }

    return match[1].toUpperCase();
  } catch {
    return null;
  }
}

function upsertTicketekExactTimeLookup(
  lookup: Map<string, string | null>,
  key: string,
  startsAt: string
): void {
  const existing = lookup.get(key);

  if (existing === undefined || existing === startsAt) {
    lookup.set(key, startsAt);
    return;
  }

  lookup.set(key, null);
}

export function mergeTicketekSearchApiResponseIntoExactTimeLookup(
  lookup: Map<string, string | null>,
  response: TicketekSearchApiResponse
): void {
  for (const event of response.events ?? []) {
    const showCode = normalizeWhitespace(event.show?.showCode ?? "");
    const venueName = normalizeWhitespace(event.venue?.name ?? "");
    const exactStartsAt = normalizeApiStartsAt(event.dateTimeLocalized);

    if (!showCode || !venueName || !exactStartsAt) {
      continue;
    }

    const venueCode =
      normalizeWhitespace(event.venue?.venueCode ?? "").toUpperCase() ||
      extractVenueCodeFromEventLink(event.link?.uri);
    const dateKey = exactStartsAt.slice(0, 10);
    const venueSlug = buildTicketekVenueSlug(venueName);
    const lookupKeys = [
      buildTicketekExactTimeLookupKey({
        externalId: showCode,
        dateKey,
        venueSlug
      })
    ];

    if (venueCode) {
      lookupKeys.push(
        buildTicketekExactTimeLookupKey({
          externalId: `${showCode}:${venueCode}`,
          dateKey,
          venueSlug
        })
      );
    }

    for (const lookupKey of lookupKeys) {
      upsertTicketekExactTimeLookup(lookup, lookupKey, exactStartsAt);
    }
  }
}

async function fetchTicketekSearchApiPage(
  query: string,
  fetchImpl: typeof fetch,
  nextPageToken?: string | null
): Promise<TicketekSearchApiResponse> {
  const response = await fetchImpl(SEARCH_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": SEARCH_API_KEY,
      "x-correlation-id": crypto.randomUUID()
    },
    body: JSON.stringify({
      searchTerm: query,
      paging: {
        pageSize: SEARCH_API_PAGE_SIZE,
        ...(nextPageToken ? { nextPageToken } : {})
      },
      visitorId: SEARCH_API_VISITOR_ID
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`Ticketek search API failed for "${query}" with status ${response.status}`);
  }

  return (await response.json()) as TicketekSearchApiResponse;
}

function parseTotalPages($: cheerio.CheerioAPI): number {
  const pageNumbers = $('a[href*="/search/SearchResults.aspx"]')
    .map((_index, element) => {
      const href = $(element).attr("href");

      if (!href) {
        return null;
      }

      try {
        const url = new URL(href, SOURCE_ORIGIN);
        const pageValue = Number(url.searchParams.get("page") ?? "");
        return Number.isInteger(pageValue) && pageValue > 0 ? pageValue : null;
      } catch {
        return null;
      }
    })
    .get()
    .filter((value): value is number => value !== null);

  return Math.max(1, ...pageNumbers);
}

function buildTicketekVenue(locationText: string): NormalizedVenue {
  const cleanedLocation = normalizeWhitespace(locationText);
  const parts = cleanedLocation
    .split(",")
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  if (
    parts.length > 0 &&
    ["wa", "western australia"].includes(parts[parts.length - 1].toLowerCase())
  ) {
    parts.pop();
  }

  const suburb = parts.length >= 2 ? parts[parts.length - 1] : null;
  const venueName = normalizeVenueName(
    parts.length >= 2 ? parts.slice(0, -1).join(", ") : cleanedLocation
  );

  return {
    name: venueName,
    slug: slugifyVenueName(venueName),
    suburb,
    address: null,
    websiteUrl: null
  };
}

function inferStatus(text: string): GigStatus {
  const haystack = text.toLowerCase();

  if (haystack.includes("cancelled") || haystack.includes("canceled")) {
    return "cancelled";
  }

  if (haystack.includes("postponed") || haystack.includes("rescheduled")) {
    return "postponed";
  }

  return "active";
}

function buildDescription(
  title: string,
  subtitle: string | null,
  summary: string | null
): string | null {
  const pieces = [subtitle, summary]
    .map((value) => (value ? normalizeWhitespace(value) : null))
    .filter((value): value is string => Boolean(value))
    .filter((value) => value.toLowerCase() !== title.toLowerCase());

  if (pieces.length === 0) {
    return null;
  }

  return pieces.join(" — ");
}

function looksLikePerthMetroLocation(locationText: string): boolean {
  const haystack = locationText.toLowerCase();
  return PERTH_METRO_TOKENS.some((token) => haystack.includes(token));
}

function looksLikeMusicListing(input: {
  title: string;
  subtitle: string | null;
  summary: string | null;
  locationText: string;
}): boolean {
  const eventText = normalizeWhitespace(
    [input.title, input.subtitle, input.summary].filter(Boolean).join(" ")
  ).toLowerCase();
  const haystack = normalizeWhitespace(
    [input.title, input.subtitle, input.summary, input.locationText].filter(Boolean).join(" ")
  ).toLowerCase();

  if (EXCLUDED_TITLE_KEYWORDS.some((keyword) => eventText.includes(keyword))) {
    return false;
  }

  if (NON_MUSIC_KEYWORDS.some((keyword) => eventText.includes(keyword))) {
    return false;
  }

  if (MUSIC_INCLUDE_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
    return true;
  }

  return MUSIC_VENUE_TOKENS.some((keyword) => haystack.includes(keyword));
}

function parseListingFromRow(
  row: cheerio.Cheerio<any>,
  context: {
    $: cheerio.CheerioAPI;
    query: string;
    title: string;
    subtitle: string | null;
    sharedImageUrl: string | null;
    moduleLevelButtonUrl: string | null;
  }
): TicketekSearchListing {
  const rowButtonHref =
    row.find(".resultBuyNow a").attr("href") ?? context.moduleLevelButtonUrl;
  const ticketUrl = normalizeEventUrl(rowButtonHref);
  const locationText = normalizeWhitespace(row.find(".contentLocation").text());
  const dateText = normalizeWhitespace(row.find(".contentDate").text());
  const summary = normalizeWhitespace(row.find(".contentResultSummary").text()) || null;

  if (!ticketUrl || !locationText || !dateText) {
    throw new SkipTicketekListingError("Ticketek listing row was missing core event fields");
  }

  if (!looksLikePerthMetroLocation(locationText)) {
    throw new SkipTicketekListingError("Ticketek listing is outside Perth metro");
  }

  if (
    !looksLikeMusicListing({
      title: context.title,
      subtitle: context.subtitle,
      summary,
      locationText
    })
  ) {
    throw new SkipTicketekListingError("Ticketek listing does not look like a live music event");
  }

  const externalId = extractExternalId(ticketUrl);

  return {
    externalId,
    title: context.title,
    subtitle: context.subtitle,
    summary,
    sourceUrl: ticketUrl,
    ticketUrl,
    imageUrl: context.sharedImageUrl,
    locationText,
    dateText,
    startsAt: buildStartsAtFromDateText(dateText),
    startsAtPrecision: "date",
    rawPayload: {
      query: context.query,
      title: context.title,
      subtitle: context.subtitle,
      summary,
      locationText,
      dateText,
      ticketUrl,
      imageUrl: context.sharedImageUrl
    }
  };
}

export function parseTicketekSearchPage(
  html: string,
  query: string
): ParsedTicketekSearchPage {
  const $ = cheerio.load(html);
  const totalPages = parseTotalPages($);
  let failedCount = 0;
  const listings: TicketekSearchListing[] = [];

  $(".resultModule").each((_index, element) => {
    try {
      const module = $(element);
      const title = normalizeWhitespace(module.find(".contentEvent h6").text());

      if (!title) {
        throw new SkipTicketekListingError("Ticketek result was missing a title");
      }

      const subtitle = normalizeWhitespace(module.find(".contentEvent .sub-title").text()) || null;
      const sharedImageUrl = normalizeAssetUrl(module.find(".contentImage img").attr("src"));
      const moduleLevelButtonUrl = normalizeEventUrl(
        module.find(".resultContainer > .resultBuyNow a").attr("href")
      );
      const eventRows = module.find(".contentEventAndDate");

      if (eventRows.length === 0) {
        throw new SkipTicketekListingError("Ticketek result did not expose an event row");
      }

      eventRows.each((_rowIndex, rowElement) => {
        try {
          const listing = parseListingFromRow($(rowElement), {
            $,
            query,
            title,
            subtitle,
            sharedImageUrl,
            moduleLevelButtonUrl
          });
          listings.push(listing);
        } catch (error) {
          if (!(error instanceof SkipTicketekListingError)) {
            failedCount += 1;
          }
        }
      });
    } catch (error) {
      if (!(error instanceof SkipTicketekListingError)) {
        failedCount += 1;
      }
    }
  });

  return { listings, failedCount, totalPages };
}

export function normalizeTicketekListing(listing: TicketekSearchListing): NormalizedGig {
  const venue = buildTicketekVenue(listing.locationText);
  const description = buildDescription(listing.title, listing.subtitle, listing.summary);
  const status = inferStatus(
    [listing.title, listing.subtitle, listing.summary].filter(Boolean).join(" ")
  );
  const artistExtraction = unknownArtistExtraction();

  return {
    sourceSlug: "ticketek-wa",
    externalId: listing.externalId,
    sourceUrl: listing.sourceUrl,
    imageUrl: listing.imageUrl,
    title: listing.title,
    description,
    status,
    startsAt: listing.startsAt,
    startsAtPrecision: listing.startsAtPrecision,
    endsAt: null,
    ticketUrl: listing.ticketUrl,
    venue,
    artists: artistExtraction.artists,
    artistExtractionKind: artistExtraction.artistExtractionKind,
    rawPayload: listing.rawPayload,
    checksum: buildGigChecksum({
      sourceSlug: "ticketek-wa",
      title: listing.title,
      startsAt: listing.startsAt,
      venueSlug: venue.slug,
      sourceUrl: listing.sourceUrl
    })
  };
}

function choosePreferredListing(
  left: TicketekSearchListing,
  right: TicketekSearchListing
): TicketekSearchListing {
  const leftScore = (left.summary?.length ?? 0) + (left.subtitle?.length ?? 0);
  const rightScore = (right.summary?.length ?? 0) + (right.subtitle?.length ?? 0);

  if (rightScore > leftScore) {
    return right;
  }

  if (right.imageUrl && !left.imageUrl) {
    return right;
  }

  return left;
}

function enrichTicketekListingWithExactTime(
  listing: TicketekSearchListing,
  exactTimeLookup: Map<string, string | null>
): TicketekSearchListing {
  const exactStartsAt = exactTimeLookup.get(
    buildTicketekExactTimeLookupKey({
      externalId: listing.externalId,
      dateKey: extractDateKey(listing.dateText) ?? listing.startsAt.slice(0, 10),
      venueSlug: buildTicketekVenue(listing.locationText).slug
    })
  );

  if (!exactStartsAt) {
    return listing;
  }

  return {
    ...listing,
    startsAt: exactStartsAt,
    startsAtPrecision: "exact",
    rawPayload: {
      ...listing.rawPayload,
      exactStartsAt,
      exactStartsAtSource: "search-api"
    }
  };
}

async function hydrateExactTimeLookupFromTitleSearch(
  listing: TicketekSearchListing,
  exactTimeLookup: Map<string, string | null>,
  fetchImpl: typeof fetch,
  titleQueryCache: Set<string>
): Promise<void> {
  const queries = [listing.title, `${listing.title} perth`];

  for (const query of queries) {
    if (titleQueryCache.has(query)) {
      continue;
    }

    titleQueryCache.add(query);

    try {
      const apiResponse = await fetchTicketekSearchApiPage(query, fetchImpl);
      mergeTicketekSearchApiResponseIntoExactTimeLookup(exactTimeLookup, apiResponse);
    } catch {
      // Keep the listing on its date-only fallback if the title lookup fails.
    }
  }
}

export const ticketekWaSource: SourceAdapter = {
  slug: "ticketek-wa",
  name: "Ticketek WA",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch): Promise<SourceAdapterResult> {
    const cookieJar = createTicketekCookieJar();
    const listingsById = new Map<string, TicketekSearchListing>();
    const exactTimeLookup = new Map<string, string | null>();
    const titleQueryCache = new Set<string>();
    let failedCount = 0;

    for (const query of SEARCH_QUERIES) {
      try {
        const firstPageHtml = await fetchTicketekPageHtml(
          buildTicketekSearchUrl(query, 1),
          fetchImpl,
          cookieJar
        );

        if (detectFrontdoorPage(firstPageHtml)) {
          failedCount += 1;
          continue;
        }

        const firstPage = parseTicketekSearchPage(firstPageHtml, query);
        failedCount += firstPage.failedCount;

        for (const listing of firstPage.listings) {
          const existing = listingsById.get(listing.externalId);
          listingsById.set(
            listing.externalId,
            existing ? choosePreferredListing(existing, listing) : listing
          );
        }

        const totalPages = Math.min(MAX_PAGES_PER_QUERY, firstPage.totalPages);

        for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
          const pageHtml = await fetchTicketekPageHtml(
            buildTicketekSearchUrl(query, pageNumber),
            fetchImpl,
            cookieJar
          );

          if (detectFrontdoorPage(pageHtml)) {
            failedCount += 1;
            break;
          }

          const pageResult = parseTicketekSearchPage(pageHtml, query);
          failedCount += pageResult.failedCount;

          for (const listing of pageResult.listings) {
            const existing = listingsById.get(listing.externalId);
            listingsById.set(
              listing.externalId,
              existing ? choosePreferredListing(existing, listing) : listing
            );
          }
        }
      } catch {
        failedCount += 1;
      }

      try {
        let nextPageToken: string | null | undefined = null;

        for (let pageNumber = 1; pageNumber <= MAX_PAGES_PER_QUERY; pageNumber += 1) {
          const apiResponse = await fetchTicketekSearchApiPage(query, fetchImpl, nextPageToken);
          mergeTicketekSearchApiResponseIntoExactTimeLookup(exactTimeLookup, apiResponse);

          if (!apiResponse.paging?.hasMore || !apiResponse.paging?.nextPageToken) {
            break;
          }

          nextPageToken = apiResponse.paging.nextPageToken;
        }
      } catch {
        // Keep the source usable with date-only fallbacks if the structured API is unavailable.
      }
    }

    const enrichedListings: TicketekSearchListing[] = [];

    for (const listing of listingsById.values()) {
      let enrichedListing = enrichTicketekListingWithExactTime(listing, exactTimeLookup);

      if (enrichedListing.startsAtPrecision !== "exact") {
        await hydrateExactTimeLookupFromTitleSearch(
          listing,
          exactTimeLookup,
          fetchImpl,
          titleQueryCache
        );
        enrichedListing = enrichTicketekListingWithExactTime(listing, exactTimeLookup);
      }

      enrichedListings.push(enrichedListing);
    }

    const gigs = enrichedListings
      .map((listing) => normalizeTicketekListing(listing))
      .sort((left, right) =>
        left.startsAt === right.startsAt
          ? left.title.localeCompare(right.title)
          : left.startsAt.localeCompare(right.startsAt)
      );

    return { gigs, failedCount };
  },
  repairArtists() {
    return unknownArtistExtraction();
  }
};
