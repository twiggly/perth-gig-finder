import {
  buildGigChecksum,
  normalizeVenueName,
  normalizeVenueWebsiteUrl,
  normalizeWhitespace,
  slugifyVenueName,
  type GigStatus,
  type JsonObject,
  type NormalizedGig,
  type NormalizedVenue,
  type StartsAtPrecision
} from "@perth-gig-finder/shared";

import { createArtistExtraction, unknownArtistExtraction } from "../artist-utils";
import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_ORIGIN = "https://www.ticketmaster.com.au";
const SOURCE_URL = `${SOURCE_ORIGIN}/discover/perth?categoryId=KZFzniwnSyZfZ7v7nJ`;
const CITY_EVENTS_API_URL = `${SOURCE_ORIGIN}/api/search/events/city`;
const POPULAR_EVENTS_API_URL = `${SOURCE_ORIGIN}/api/recommendations/popular/events`;
const PERTH_OFFSET_SUFFIX = "+08:00";
const DEFAULT_START_HOUR = 12;
const REQUEST_TIMEOUT_MS = 15_000;
const CITY_EVENTS_CITIES =
  "Perth,Burswood,Mt Claremont,East Perth,West Perth,Joondalup,Lathlain";
const CITY_EVENTS_STATE_CODES = "WA";
const CITY_EVENTS_COUNTRY_CODES = "AU";
const POPULAR_EVENTS_MAX = 9;

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
  "midland",
  "lathlain"
]);

interface TicketmasterCityEventDates {
  startDate?: string;
  endDate?: string;
  spanMultipleDays?: boolean;
}

interface TicketmasterCityEventVenue {
  city?: string;
  name?: string;
  state?: string;
  url?: string;
  imageUrl?: string;
  addressLineOne?: string;
  code?: string;
}

interface TicketmasterCityEventArtistImageUrls {
  ARTIST_PAGE_3_2?: string;
  RETINA_PORTRAIT_16_9?: string;
}

interface TicketmasterCityEventArtist {
  name?: string;
  url?: string;
  imageUrls?: TicketmasterCityEventArtistImageUrls;
}

interface TicketmasterCityEvent {
  title?: string;
  id?: string;
  discoveryId?: string;
  dates?: TicketmasterCityEventDates;
  url?: string;
  partnerEvent?: boolean;
  isPartner?: boolean;
  showTmButton?: boolean;
  venue?: TicketmasterCityEventVenue;
  timeZone?: string;
  cancelled?: boolean;
  postponed?: boolean;
  rescheduled?: boolean;
  tba?: boolean;
  local?: boolean;
  soldOut?: boolean;
  limitedAvailability?: boolean;
  ticketingStatus?: string;
  eventChangeStatus?: string;
  virtual?: boolean;
  artists?: TicketmasterCityEventArtist[];
}

interface TicketmasterCityEventsResponse {
  total?: number;
  events?: TicketmasterCityEvent[];
}

interface TicketmasterPopularEvent {
  name?: string;
  venue?: string;
  imageUrl?: string;
  url?: string;
  localDate?: string;
  localTime?: string;
}

interface TicketmasterPopularEventsResponse {
  popularEvents?: TicketmasterPopularEvent[];
}

class SkipTicketmasterEventError extends Error {}

class TicketmasterBlockedError extends Error {
  constructor(
    readonly path: string,
    readonly status: number
  ) {
    super(`Ticketmaster ${path} failed with status ${status}`);
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

function buildRequestHeaders(): HeadersInit {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-AU,en;q=0.9"
  };
}

function isBlockedStatus(status: number): boolean {
  return [401, 403, 429].includes(status);
}

function getDirectEventUrl(event: Pick<TicketmasterCityEvent, "url">): string | null {
  const normalized = normalizeUrl(event.url);

  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized);

    if (
      url.hostname.endsWith("ticketmaster.com.au") &&
      /\/event\/[^/?#]+/i.test(url.pathname)
    ) {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function getArtistImageUrl(event: TicketmasterCityEvent): string | null {
  for (const artist of event.artists ?? []) {
    const candidates = [
      artist.imageUrls?.RETINA_PORTRAIT_16_9,
      artist.imageUrls?.ARTIST_PAGE_3_2
    ];

    for (const candidate of candidates) {
      const normalized = normalizeUrl(candidate);

      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
}

function getImageUrl(
  event: TicketmasterCityEvent,
  popularImageUrl: string | null
): string | null {
  return normalizeUrl(popularImageUrl) ?? getArtistImageUrl(event);
}

function getPerformerNames(event: TicketmasterCityEvent): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const artist of event.artists ?? []) {
    const normalizedName = normalizeWhitespace(artist.name ?? "");
    const key = normalizedName.toLowerCase();

    if (!normalizedName || seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(normalizedName);
  }

  return names;
}

export function extractTicketmasterArtists(event: TicketmasterCityEvent) {
  return createArtistExtraction(getPerformerNames(event), "structured");
}

function inferStatus(event: TicketmasterCityEvent): GigStatus {
  if (event.cancelled) {
    return "cancelled";
  }

  if (event.postponed || event.rescheduled) {
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

function buildVenueAddress(
  venue: Pick<TicketmasterCityEventVenue, "addressLineOne" | "city" | "state" | "code"> | null | undefined
): string | null {
  if (!venue) {
    return null;
  }

  const parts = [
    venue.addressLineOne,
    venue.city,
    venue.state,
    venue.code
  ]
    .map((part) => normalizeWhitespace(part ?? ""))
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

function buildVenue(venue: TicketmasterCityEventVenue | null | undefined): NormalizedVenue {
  const venueName = normalizeVenueName(normalizeWhitespace(venue?.name ?? ""));

  if (!venueName) {
    throw new Error("Ticketmaster event is missing a venue name");
  }

  const suburb = normalizeWhitespace(venue?.city ?? "") || null;

  return {
    name: venueName,
    slug: slugifyVenueName(venueName),
    suburb,
    address: buildVenueAddress(venue),
    websiteUrl: normalizeVenueWebsiteUrl(venueName, normalizeUrl(venue?.url))
  };
}

function ensurePerthMetroVenue(event: TicketmasterCityEvent): void {
  const locality = normalizeWhitespace(event.venue?.city ?? "").toLowerCase();
  const region = normalizeWhitespace(event.venue?.state ?? "").toLowerCase();

  if (region && region !== "wa") {
    throw new SkipTicketmasterEventError("Ticketmaster event is outside WA");
  }

  if (locality && !PERTH_METRO_LOCALITIES.has(locality)) {
    throw new SkipTicketmasterEventError("Ticketmaster event is outside Perth metro");
  }
}

function extractExternalId(sourceUrl: string, fallbackId: string | null | undefined): string {
  const match = sourceUrl.match(/\/event\/([^/?#]+)/i);

  if (match?.[1]) {
    return match[1];
  }

  const normalizedFallbackId = normalizeWhitespace(fallbackId ?? "");

  if (normalizedFallbackId) {
    return normalizedFallbackId;
  }

  throw new Error(`Ticketmaster event URL is missing an event id: ${sourceUrl}`);
}

function buildCityEventsApiUrl(page: number): string {
  const url = new URL(CITY_EVENTS_API_URL);

  url.searchParams.set("page", String(page));
  url.searchParams.set("cities", CITY_EVENTS_CITIES);
  url.searchParams.set("stateCodes", CITY_EVENTS_STATE_CODES);
  url.searchParams.set("categoryId", "KZFzniwnSyZfZ7v7nJ");
  url.searchParams.set("countryCodes", CITY_EVENTS_COUNTRY_CODES);

  return url.toString();
}

function buildPopularEventsApiUrl(): string {
  const url = new URL(POPULAR_EVENTS_API_URL);

  url.searchParams.set("cities", CITY_EVENTS_CITIES);
  url.searchParams.set("stateCodes", CITY_EVENTS_STATE_CODES);
  url.searchParams.set("categoryId", "KZFzniwnSyZfZ7v7nJ");
  url.searchParams.set("maxEventsPerAttraction", "1");
  url.searchParams.set("maxEvents", String(POPULAR_EVENTS_MAX));
  url.searchParams.set("size", String(POPULAR_EVENTS_MAX));
  url.searchParams.set("sort", "relevance");
  url.searchParams.set("logTag", "cdp-popular");

  return url.toString();
}

async function fetchJson<T>(
  url: string,
  label: string,
  fetchImpl: typeof fetch
): Promise<T> {
  const response = await fetchImpl(url, {
    headers: buildRequestHeaders(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    if (isBlockedStatus(response.status)) {
      throw new TicketmasterBlockedError(label, response.status);
    }

    throw new Error(`Ticketmaster ${label} failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchTicketmasterCityEventsPage(
  page: number,
  fetchImpl: typeof fetch
): Promise<TicketmasterCityEventsResponse> {
  return await fetchJson<TicketmasterCityEventsResponse>(
    buildCityEventsApiUrl(page),
    `city events page ${page}`,
    fetchImpl
  );
}

async function fetchTicketmasterPopularEvents(
  fetchImpl: typeof fetch
): Promise<TicketmasterPopularEventsResponse> {
  return await fetchJson<TicketmasterPopularEventsResponse>(
    buildPopularEventsApiUrl(),
    "popular events",
    fetchImpl
  );
}

function buildPopularImageMap(popularEvents: TicketmasterPopularEvent[] | undefined): Map<string, string> {
  const imagesByUrl = new Map<string, string>();

  for (const event of popularEvents ?? []) {
    const normalizedUrl = normalizeUrl(event.url);
    const normalizedImage = normalizeUrl(event.imageUrl);

    if (!normalizedUrl || !normalizedImage) {
      continue;
    }

    imagesByUrl.set(normalizedUrl, normalizedImage);
  }

  return imagesByUrl;
}

export function normalizeTicketmasterEvent(
  event: TicketmasterCityEvent,
  popularImageUrl: string | null = null
): NormalizedGig {
  const title = normalizeWhitespace(event.title ?? "");

  if (!title) {
    throw new Error("Ticketmaster event is missing a title");
  }

  if (event.isPartner || event.partnerEvent) {
    throw new SkipTicketmasterEventError("Ticketmaster city event points to a partner site");
  }

  const sourceUrl = getDirectEventUrl(event);

  if (!sourceUrl) {
    throw new SkipTicketmasterEventError("Ticketmaster city event does not expose a direct event URL");
  }

  ensurePerthMetroVenue(event);

  const externalId = extractExternalId(sourceUrl, event.id);
  const { startsAt, startsAtPrecision } = normalizeStartsAt(event.dates?.startDate);
  const venue = buildVenue(event.venue);
  const artistExtraction = extractTicketmasterArtists(event);

  return {
    sourceSlug: "ticketmaster-au",
    externalId,
    sourceUrl,
    imageUrl: getImageUrl(event, popularImageUrl),
    title,
    description: null,
    status: inferStatus(event),
    startsAt,
    startsAtPrecision,
    endsAt: normalizeEndsAt(event.dates?.endDate),
    ticketUrl: sourceUrl,
    venue,
    artists: artistExtraction.artists,
    artistExtractionKind: artistExtraction.artistExtractionKind,
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

export const ticketmasterAuSource: SourceAdapter = {
  slug: "ticketmaster-au",
  name: "Ticketmaster AU",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch): Promise<SourceAdapterResult> {
    let popularImageUrls = new Map<string, string>();

    try {
      const popularEvents = await fetchTicketmasterPopularEvents(fetchImpl);
      popularImageUrls = buildPopularImageMap(popularEvents.popularEvents);
    } catch (error) {
      if (error instanceof TicketmasterBlockedError) {
        console.warn(
          `[ticketmaster-au] ${error.path} blocked with status ${error.status}; continuing without popular-event image enrichment`
        );
      } else {
        console.warn(
          `[ticketmaster-au] popular events enrichment failed: ${error instanceof Error ? error.message : "Unexpected error"}`
        );
      }
    }

    let firstPage: TicketmasterCityEventsResponse;

    try {
      firstPage = await fetchTicketmasterCityEventsPage(0, fetchImpl);
    } catch (error) {
      if (error instanceof TicketmasterBlockedError) {
        console.warn(
          `[ticketmaster-au] ${error.path} blocked with status ${error.status}; skipping source for this run`
        );

        return {
          gigs: [],
          failedCount: 0
        };
      }

      throw error;
    }

    const events = [...(firstPage.events ?? [])];
    const total = firstPage.total ?? events.length;
    let failedCount = 0;

    for (let page = 1; events.length < total; page += 1) {
      try {
        const pageResult = await fetchTicketmasterCityEventsPage(page, fetchImpl);
        const pageEvents = pageResult.events ?? [];

        if (pageEvents.length === 0) {
          break;
        }

        events.push(...pageEvents);
      } catch (error) {
        if (error instanceof TicketmasterBlockedError) {
          console.warn(
            `[ticketmaster-au] ${error.path} blocked with status ${error.status}; keeping earlier Ticketmaster results only`
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
        const sourceUrl = getDirectEventUrl(event);
        const gig = normalizeTicketmasterEvent(
          event,
          sourceUrl ? popularImageUrls.get(sourceUrl) ?? null : null
        );
        const dedupeKey = gig.externalId ?? gig.sourceUrl;

        if (seenExternalIds.has(dedupeKey)) {
          continue;
        }

        seenExternalIds.add(dedupeKey);
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
  },
  repairArtists(rawPayload) {
    const event =
      rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
        ? (rawPayload as TicketmasterCityEvent)
        : null;

    return event ? extractTicketmasterArtists(event) : unknownArtistExtraction();
  }
};
