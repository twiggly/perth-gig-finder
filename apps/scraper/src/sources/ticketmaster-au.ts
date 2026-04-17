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

import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_ORIGIN = "https://www.ticketmaster.com.au";
const SOURCE_URL = `${SOURCE_ORIGIN}/discover/perth?categoryId=KZFzniwnSyZfZ7v7nJ`;
const PERTH_OFFSET_SUFFIX = "+08:00";
const DEFAULT_START_HOUR = 12;
const REQUEST_TIMEOUT_MS = 15_000;

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
  "north fremantle",
  "scarborough",
  "joondalup",
  "cannington",
  "guildford",
  "midland"
]);

interface TicketmasterStructuredAddress {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
}

interface TicketmasterStructuredPlace {
  name?: string;
  sameAs?: string;
  address?: TicketmasterStructuredAddress;
}

interface TicketmasterStructuredOffer {
  url?: string;
}

interface TicketmasterStructuredPerformer {
  name?: string;
}

interface TicketmasterStructuredEvent {
  "@type"?: string | string[];
  url?: string;
  name?: string;
  description?: string;
  image?: string | string[];
  startDate?: string;
  endDate?: string;
  eventStatus?: string;
  location?: TicketmasterStructuredPlace;
  offers?: TicketmasterStructuredOffer | TicketmasterStructuredOffer[];
  performer?: TicketmasterStructuredPerformer | TicketmasterStructuredPerformer[];
}

export interface ParsedTicketmasterDiscoverPage {
  events: TicketmasterStructuredEvent[];
  failedCount: number;
  totalPages: number;
}

class SkipTicketmasterEventError extends Error {}

class TicketmasterBlockedError extends Error {
  constructor(
    readonly page: number,
    readonly status: number
  ) {
    super(`Ticketmaster discover page ${page} failed with status ${status}`);
  }
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
    : `https://${withOrigin}`;

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

function getDirectEventUrl(event: TicketmasterStructuredEvent): string | null {
  const candidateUrls = [
    event.url,
    ...(Array.isArray(event.offers)
      ? event.offers.map((offer) => offer.url)
      : [event.offers?.url])
  ];

  for (const candidate of candidateUrls) {
    const normalized = normalizeUrl(candidate);

    if (!normalized) {
      continue;
    }

    try {
      const url = new URL(normalized);

      if (url.hostname.endsWith("ticketmaster.com.au") && /\/event\/[^/?#]+/i.test(url.pathname)) {
        return url.toString();
      }
    } catch {
      continue;
    }
  }

  return null;
}

function getImageUrl(event: TicketmasterStructuredEvent): string | null {
  const candidates = Array.isArray(event.image) ? event.image : [event.image];

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function getPerformerNames(event: TicketmasterStructuredEvent): string[] {
  const performers = Array.isArray(event.performer)
    ? event.performer
    : event.performer
      ? [event.performer]
      : [];

  const seen = new Set<string>();
  const names: string[] = [];

  for (const performer of performers) {
    const normalizedName = normalizeWhitespace(performer?.name ?? "");
    const key = normalizedName.toLowerCase();

    if (!normalizedName || seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(normalizedName);
  }

  return names;
}

function inferStatus(eventStatus: string | null | undefined): GigStatus {
  const normalized = normalizeWhitespace(eventStatus ?? "").toLowerCase();

  if (normalized.includes("cancel")) {
    return "cancelled";
  }

  if (normalized.includes("postpon") || normalized.includes("resched")) {
    return "postponed";
  }

  return "active";
}

function normalizeStartsAt(value: string | null | undefined): {
  startsAt: string;
  startsAtPrecision: StartsAtPrecision;
} {
  const normalized = normalizeWhitespace(value ?? "");

  if (!normalized) {
    throw new Error("Ticketmaster event is missing a start date");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return {
      startsAt: new Date(
        `${normalized}T${String(DEFAULT_START_HOUR).padStart(2, "0")}:00:00${PERTH_OFFSET_SUFFIX}`
      ).toISOString(),
      startsAtPrecision: "date"
    };
  }

  const withTimezone =
    normalized.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(normalized)
      ? normalized
      : `${normalized}${PERTH_OFFSET_SUFFIX}`;
  const startsAt = new Date(withTimezone);

  if (Number.isNaN(startsAt.getTime())) {
    throw new Error(`Invalid Ticketmaster start date: ${value}`);
  }

  return {
    startsAt: startsAt.toISOString(),
    startsAtPrecision: "exact"
  };
}

function normalizeEndsAt(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value ?? "");

  if (!normalized || /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const withTimezone =
    normalized.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(normalized)
      ? normalized
      : `${normalized}${PERTH_OFFSET_SUFFIX}`;
  const endsAt = new Date(withTimezone);

  if (Number.isNaN(endsAt.getTime())) {
    return null;
  }

  return endsAt.toISOString();
}

function buildVenueAddress(address: TicketmasterStructuredAddress | null | undefined): string | null {
  if (!address) {
    return null;
  }

  const parts = [
    address.streetAddress,
    address.addressLocality,
    address.addressRegion,
    address.postalCode
  ]
    .map((part) => normalizeWhitespace(part ?? ""))
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

function buildVenue(input: TicketmasterStructuredPlace | null | undefined): NormalizedVenue {
  const venueName = normalizeVenueName(normalizeWhitespace(input?.name ?? ""));

  if (!venueName) {
    throw new Error("Ticketmaster event is missing a venue name");
  }

  const suburb = normalizeWhitespace(input?.address?.addressLocality ?? "") || null;

  return {
    name: venueName,
    slug: slugifyVenueName(venueName),
    suburb,
    address: buildVenueAddress(input?.address),
    websiteUrl: normalizeVenueWebsiteUrl(venueName, normalizeUrl(input?.sameAs))
  };
}

function ensurePerthMetroVenue(event: TicketmasterStructuredEvent): void {
  const locality = normalizeWhitespace(event.location?.address?.addressLocality ?? "").toLowerCase();
  const region = normalizeWhitespace(event.location?.address?.addressRegion ?? "").toLowerCase();

  if (region && region !== "wa") {
    throw new SkipTicketmasterEventError("Ticketmaster event is outside WA");
  }

  if (locality && !PERTH_METRO_LOCALITIES.has(locality)) {
    throw new SkipTicketmasterEventError("Ticketmaster event is outside Perth metro");
  }
}

function extractExternalId(sourceUrl: string): string {
  const match = sourceUrl.match(/\/event\/([^/?#]+)/i);

  if (!match?.[1]) {
    throw new Error(`Ticketmaster event URL is missing an event id: ${sourceUrl}`);
  }

  return match[1];
}

function parseTotalPages($: cheerio.CheerioAPI, html: string): number {
  const hrefPageNumbers = $('a[href*="page="]')
    .map((_index, element) => {
      const href = $(element).attr("href");

      if (!href) {
        return null;
      }

      try {
        const url = new URL(href, SOURCE_ORIGIN);
        const page = Number(url.searchParams.get("page") ?? "");

        return Number.isInteger(page) && page > 0 ? page : null;
      } catch {
        return null;
      }
    })
    .get()
    .filter((value): value is number => value !== null);

  const pageTextMatch = html.match(/Page\s+\d+\s+of\s+(\d+)/i);
  const pageTextTotal = pageTextMatch ? Number.parseInt(pageTextMatch[1], 10) : 1;

  return Math.max(1, pageTextTotal, ...hrefPageNumbers);
}

function collectStructuredEventCandidates(value: JsonValue | null): TicketmasterStructuredEvent[] {
  if (!value) {
    return [];
  }

  const candidates = Array.isArray(value) ? value : [value];
  const events: TicketmasterStructuredEvent[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const record = candidate as JsonObject;
    const rawEventType = record["@type"];
    const eventTypes = Array.isArray(rawEventType)
      ? rawEventType.filter((item): item is string => typeof item === "string")
      : typeof rawEventType === "string"
        ? [rawEventType]
        : [];

    if (eventTypes.includes("MusicEvent")) {
      events.push(record as unknown as TicketmasterStructuredEvent);
    }
  }

  return events;
}

export function parseTicketmasterDiscoverPage(html: string): ParsedTicketmasterDiscoverPage {
  const $ = cheerio.load(html);
  const events: TicketmasterStructuredEvent[] = [];
  let failedCount = 0;

  $('script[type="application/ld+json"]').each((_index, element) => {
    const payload = parseJsonValue($(element).html());

    if ($(element).html() && payload === null) {
      failedCount += 1;
      return;
    }

    events.push(...collectStructuredEventCandidates(payload));
  });

  return {
    events,
    failedCount,
    totalPages: parseTotalPages($, html)
  };
}

export function normalizeTicketmasterEvent(event: TicketmasterStructuredEvent): NormalizedGig {
  const title = normalizeWhitespace(event.name ?? "");

  if (!title) {
    throw new Error("Ticketmaster event is missing a title");
  }

  const sourceUrl = getDirectEventUrl(event);

  if (!sourceUrl) {
    throw new SkipTicketmasterEventError("Ticketmaster discover entry points to a partner site");
  }

  ensurePerthMetroVenue(event);

  const externalId = extractExternalId(sourceUrl);
  const { startsAt, startsAtPrecision } = normalizeStartsAt(event.startDate);
  const venue = buildVenue(event.location);
  const artists = getPerformerNames(event);

  return {
    sourceSlug: "ticketmaster-au",
    externalId,
    sourceUrl,
    imageUrl: getImageUrl(event),
    title,
    description: normalizeWhitespace(event.description ?? "") || null,
    status: inferStatus(event.eventStatus),
    startsAt,
    startsAtPrecision,
    endsAt: normalizeEndsAt(event.endDate),
    ticketUrl: sourceUrl,
    venue,
    artists: artists.length > 0 ? artists : [title],
    rawPayload: event as JsonObject,
    checksum: buildGigChecksum({
      sourceSlug: "ticketmaster-au",
      startsAt,
      title,
      venueSlug: venue.slug,
      sourceUrl
    })
  };
}

function buildDiscoverPageUrl(page: number): string {
  const url = new URL(SOURCE_URL);

  if (page > 1) {
    url.searchParams.set("page", String(page));
  }

  return url.toString();
}

async function fetchTicketmasterDiscoverPage(
  page: number,
  fetchImpl: typeof fetch
): Promise<string> {
  const response = await fetchImpl(buildDiscoverPageUrl(page), {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-AU,en;q=0.9"
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    if ([401, 403, 429].includes(response.status)) {
      throw new TicketmasterBlockedError(page, response.status);
    }

    throw new Error(
      `Ticketmaster discover page ${page} failed with status ${response.status}`
    );
  }

  return await response.text();
}

export const ticketmasterAuSource: SourceAdapter = {
  slug: "ticketmaster-au",
  name: "Ticketmaster AU",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch): Promise<SourceAdapterResult> {
    let firstPage: ParsedTicketmasterDiscoverPage;

    try {
      firstPage = parseTicketmasterDiscoverPage(
        await fetchTicketmasterDiscoverPage(1, fetchImpl)
      );
    } catch (error) {
      if (error instanceof TicketmasterBlockedError) {
        console.warn(
          `[ticketmaster-au] discover page ${error.page} blocked with status ${error.status}; skipping source for this run`
        );

        return {
          gigs: [],
          failedCount: 0
        };
      }

      throw error;
    }

    const events = [...firstPage.events];
    let failedCount = firstPage.failedCount;

    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      try {
        const pageResult = parseTicketmasterDiscoverPage(
          await fetchTicketmasterDiscoverPage(page, fetchImpl)
        );

        failedCount += pageResult.failedCount;
        events.push(...pageResult.events);
      } catch (error) {
        if (error instanceof TicketmasterBlockedError) {
          console.warn(
            `[ticketmaster-au] discover page ${error.page} blocked with status ${error.status}; keeping earlier Ticketmaster results only`
          );
          break;
        }

        throw error;
      }
    }

    const gigs: NormalizedGig[] = [];
    const seenExternalIds = new Set<string>();

    for (const event of events) {
      try {
        const gig = normalizeTicketmasterEvent(event);

        if (seenExternalIds.has(gig.externalId ?? gig.sourceUrl)) {
          continue;
        }

        seenExternalIds.add(gig.externalId ?? gig.sourceUrl);
        gigs.push(gig);
      } catch (error) {
        if (error instanceof SkipTicketmasterEventError) {
          continue;
        }

        failedCount += 1;
      }
    }

    return {
      gigs,
      failedCount
    };
  }
};
