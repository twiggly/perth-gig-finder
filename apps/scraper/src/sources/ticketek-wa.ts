import * as cheerio from "cheerio";

import {
  buildGigChecksum,
  normalizeVenueName,
  normalizeWhitespace,
  slugifyVenueName,
  type GigStatus,
  type JsonObject,
  type NormalizedGig,
  type NormalizedVenue
} from "@perth-gig-finder/shared";

import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_ORIGIN = "https://premier.ticketek.com.au";
const SOURCE_URL = `${SOURCE_ORIGIN}/search/SearchResults.aspx`;
const REGION_COOKIE_NAME = "ticketek.com.au+2";
const REGION_COOKIE_VALUE = "wa";
const PERTH_OFFSET_SUFFIX = "+08:00";
// Ticketek's fetchable search markup exposes dates but not event times, so we
// anchor date-only results to local noon to preserve day-level browsing.
const DEFAULT_START_HOUR = 12;
const MAX_PAGES_PER_QUERY = 3;
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
  rawPayload: JsonObject;
}

export interface ParsedTicketekSearchPage {
  listings: TicketekSearchListing[];
  failedCount: number;
  totalPages: number;
}

class SkipTicketekListingError extends Error {}

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
    : new URL(trimmed, SOURCE_ORIGIN).toString();

  try {
    const url = new URL(withOrigin);

    if (url.protocol === "http:") {
      url.protocol = "https:";
    }

    const showId = url.searchParams.get("sh");
    const venueVariant = url.searchParams.get("v");

    url.pathname = "/Shows/Show.aspx";
    url.search = "";

    if (showId) {
      url.searchParams.set("sh", showId);
    }

    if (venueVariant) {
      url.searchParams.set("v", venueVariant);
    }

    return url.toString();
  } catch {
    return withOrigin;
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
    haystack.includes("ticketek australia") &&
    haystack.includes("just one device") &&
    haystack.includes("security flags")
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
  const ticketUrl = normalizeUrl(rowButtonHref);
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
      const sharedImageUrl = normalizeUrl(module.find(".contentImage img").attr("src"));
      const moduleLevelButtonUrl = normalizeUrl(
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

  return {
    sourceSlug: "ticketek-wa",
    externalId: listing.externalId,
    sourceUrl: listing.sourceUrl,
    imageUrl: listing.imageUrl,
    title: listing.title,
    description,
    status,
    startsAt: listing.startsAt,
    endsAt: null,
    ticketUrl: listing.ticketUrl,
    venue,
    artists: [listing.title],
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

export const ticketekWaSource: SourceAdapter = {
  slug: "ticketek-wa",
  name: "Ticketek WA",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch): Promise<SourceAdapterResult> {
    const cookieJar = createTicketekCookieJar();
    const listingsById = new Map<string, TicketekSearchListing>();
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
    }

    const gigs = [...listingsById.values()]
      .map((listing) => normalizeTicketekListing(listing))
      .sort((left, right) =>
        left.startsAt === right.startsAt
          ? left.title.localeCompare(right.title)
          : left.startsAt.localeCompare(right.startsAt)
      );

    return { gigs, failedCount };
  }
};
