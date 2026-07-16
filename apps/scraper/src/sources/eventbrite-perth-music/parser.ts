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
  type NormalizedVenue,
  type StartsAtPrecision
} from "@perth-gig-finder/shared";

import {
  createArtistExtraction,
  preferArtistDisplayNamesFromTitle,
  unknownArtistExtraction
} from "../../artist-utils";
import type {
  EventbriteDiscoveryAddress,
  EventbriteDiscoveryEvent,
  EventbriteDiscoveryListing,
  EventbriteDiscoveryPagination,
  EventbriteDiscoveryTag,
  EventbriteStructuredAddress,
  EventbriteStructuredEvent,
  EventbriteStructuredImage,
  EventbriteStructuredPerformer,
  ParsedEventbriteDiscoveryPage
} from "./types";

const SOURCE_SLUG = "eventbrite-perth-music";
const EVENTBRITE_DISCOVERY_HOST = "www.eventbrite.com.au";
const EVENTBRITE_DISCOVERY_PATH =
  "/d/australia--perth--4807/music--events/";
const PERTH_TIMEZONE = "Australia/Perth";
const PERTH_OFFSET_SUFFIX = "+08:00";
const DEFAULT_START_HOUR = 12;

const EVENTBRITE_EVENT_HOST_SUFFIXES = [
  "eventbrite.com.au",
  "eventbrite.com",
  "eventbrite.co"
];

const HARD_REJECT_PATTERNS = [
  /\bbingo\b/i,
  /\bkaraoke\b/i,
  /\btrivia\b/i,
  /\bworkshops?\b/i,
  /\bclinics?\b/i,
  /\b(?:class|course|lesson|seminar)s?\b/i,
  /\b(?:album\s+)?listening\s+part(?:y|ies)\b/i,
  /\bsilent\s+disco\b/i,
  /\bsound\s+healing\b/i
];

const HARD_REJECT_FORMATS = new Set([
  "class training or workshop",
  "game or competition",
  "conference",
  "seminar or talk",
  "screening"
]);

const DIRECT_MUSIC_FORMATS = new Set([
  "concert or performance",
  "festival or fair"
]);

const PARTY_FORMAT = "party or social gathering";

const PARTY_MUSIC_SIGNAL_PATTERNS = [
  /\bdj\b/i,
  /\brave\b/i,
  /\blive\b/i,
  /\bbands?\b/i,
  /\bconcert\b/i,
  /\bfestival\b/i,
  /\btour\b/i,
  /\btechno\b/i,
  /\bhouse\b/i,
  /\bdisco\b/i,
  /\brock\b/i,
  /\bmetal\b/i,
  /\bpunk\b/i,
  /\bemo\b/i,
  /\bindie\b/i,
  /\bjazz\b/i,
  /\bblues\b/i,
  /\bfolk\b/i,
  /\bhip[ -]?hop\b/i,
  /\br\s*(?:&|and|n)\s*b\b/i,
  /\belectronic\b/i,
  /\bdrum\s+(?:and|&)\s+bass\b/i,
  /\bsoul\b/i,
  /\bfunk\b/i
];

export type { ParsedEventbriteDiscoveryPage } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toJsonObject(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function toPositiveInteger(value: unknown): number | null {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;

  return Number.isInteger(numberValue) && numberValue > 0
    ? numberValue
    : null;
}

function normalizeKeywordText(value: string | null | undefined): string {
  return normalizeWhitespace(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9&]+/g, " ")
    .trim();
}

function hasOwnedEventbriteHost(hostname: string): boolean {
  const normalizedHostname = hostname.toLowerCase();

  return EVENTBRITE_EVENT_HOST_SUFFIXES.some(
    (suffix) =>
      normalizedHostname === suffix ||
      normalizedHostname.endsWith(`.${suffix}`)
  );
}

export function extractEventbriteEventId(
  value: string | null | undefined
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" ||
      !hasOwnedEventbriteHost(url.hostname) ||
      !url.pathname.startsWith("/e/")
    ) {
      return null;
    }

    return url.pathname.match(/-(\d+)\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

export function normalizeEventbriteEventUrl(
  value: string | null | undefined,
  expectedEventId?: string
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    const eventId = extractEventbriteEventId(url.toString());

    if (!eventId || (expectedEventId && eventId !== expectedEventId)) {
      return null;
    }

    url.protocol = "https:";
    url.search = "";
    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeEventbriteDiscoveryUrl(
  value: string | null | undefined,
  currentUrl = `https://${EVENTBRITE_DISCOVERY_HOST}${EVENTBRITE_DISCOVERY_PATH}?page=1`
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, currentUrl);

    if (
      url.protocol !== "https:" ||
      url.hostname !== EVENTBRITE_DISCOVERY_HOST ||
      url.pathname !== EVENTBRITE_DISCOVERY_PATH
    ) {
      return null;
    }

    const pageNumber = toPositiveInteger(url.searchParams.get("page") ?? "1");

    if (!pageNumber) {
      return null;
    }

    for (const key of url.searchParams.keys()) {
      if (key !== "page") {
        return null;
      }
    }

    url.search = "";
    url.searchParams.set("page", String(pageNumber));
    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

function findBalancedJsonObject(source: string, objectStart: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      depth += 1;
      continue;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(objectStart, index + 1);
      }
    }
  }

  return null;
}

export function extractEventbriteServerData(html: string): Record<string, unknown> {
  const marker = "window.__SERVER_DATA__";
  const markerIndex = html.indexOf(marker);

  if (markerIndex < 0) {
    throw new Error("Eventbrite discovery page is missing server data");
  }

  const assignmentIndex = html.indexOf("=", markerIndex + marker.length);
  const objectStart = html.indexOf("{", assignmentIndex + 1);

  if (assignmentIndex < 0 || objectStart < 0) {
    throw new Error("Eventbrite discovery server data is malformed");
  }

  const serialized = findBalancedJsonObject(html, objectStart);

  if (!serialized) {
    throw new Error("Eventbrite discovery server data is incomplete");
  }

  const parsed = JSON.parse(serialized) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Eventbrite discovery server data is not an object");
  }

  return parsed;
}

function extractDiscoveryEventsData(serverData: Record<string, unknown>): {
  events: EventbriteDiscoveryEvent[];
  pagination: EventbriteDiscoveryPagination;
} {
  const searchData = serverData.search_data;
  const eventsData = isRecord(searchData) ? searchData.events : null;

  if (!isRecord(eventsData) || !Array.isArray(eventsData.results)) {
    throw new Error("Eventbrite discovery page is missing event results");
  }

  if (!eventsData.results.every(isRecord)) {
    throw new Error("Eventbrite discovery event results are malformed");
  }

  const rawPagination = eventsData.pagination;

  if (!isRecord(rawPagination)) {
    throw new Error("Eventbrite discovery page is missing pagination");
  }

  const objectCount = toPositiveInteger(rawPagination.object_count);
  const pageCount = toPositiveInteger(rawPagination.page_count);
  const pageNumber = toPositiveInteger(rawPagination.page_number);
  const pageSize = toPositiveInteger(rawPagination.page_size);

  if (!objectCount || !pageCount || !pageNumber || !pageSize) {
    throw new Error("Eventbrite discovery pagination is malformed");
  }

  return {
    events: eventsData.results as EventbriteDiscoveryEvent[],
    pagination: {
      objectCount,
      pageCount,
      pageNumber,
      pageSize
    }
  };
}

function flattenJsonLd(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }

  if (!isRecord(value)) {
    return [];
  }

  const graph = Array.isArray(value["@graph"])
    ? value["@graph"].flatMap(flattenJsonLd)
    : [];

  return [value, ...graph];
}

function hasJsonLdType(value: unknown, expectedType: string): boolean {
  const types = Array.isArray(value) ? value : [value];
  return types.some(
    (type) =>
      typeof type === "string" &&
      type.toLowerCase().split("/").at(-1) === expectedType.toLowerCase()
  );
}

function hasEventJsonLdType(value: unknown): boolean {
  const types = Array.isArray(value) ? value : [value];

  return types.some((type) => {
    if (typeof type !== "string") {
      return false;
    }

    const typeName = type.split("/").at(-1) ?? "";
    return typeName === "Festival" || typeName.endsWith("Event");
  });
}

function getItemListEventUrl(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeEventbriteEventUrl(value);
  }

  if (!isRecord(value)) {
    return null;
  }

  const item = value.item;

  if (typeof item === "string") {
    return normalizeEventbriteEventUrl(item);
  }

  if (isRecord(item)) {
    return normalizeEventbriteEventUrl(
      typeof item.url === "string" ? item.url : null
    );
  }

  return normalizeEventbriteEventUrl(
    typeof value.url === "string" ? value.url : null
  );
}

function extractItemListEvents($: cheerio.CheerioAPI): Map<string, string> {
  const eventsById = new Map<string, string>();

  $("script[type='application/ld+json']").each((_, element) => {
    const content = $(element).text().trim();

    if (!content) {
      return;
    }

    try {
      const parsed = JSON.parse(content) as JsonValue;

      for (const entry of flattenJsonLd(parsed)) {
        if (!isRecord(entry) || !hasJsonLdType(entry["@type"], "ItemList")) {
          continue;
        }

        const items = Array.isArray(entry.itemListElement)
          ? entry.itemListElement
          : [];

        for (const item of items) {
          const eventUrl = getItemListEventUrl(item);
          const eventId = extractEventbriteEventId(eventUrl);

          if (eventId && eventUrl) {
            eventsById.set(eventId, eventUrl);
          }
        }
      }
    } catch {
      // Other JSON-LD blocks can be malformed without invalidating server data.
    }
  });

  return eventsById;
}

function getDiscoveryEventId(event: EventbriteDiscoveryEvent): string | null {
  const rawId = event.eventbrite_event_id ?? event.id;

  if (typeof rawId !== "string" && typeof rawId !== "number") {
    return null;
  }

  const normalized = String(rawId).trim();
  return /^\d+$/.test(normalized) ? normalized : null;
}

function getNextPageUrl(
  $: cheerio.CheerioAPI,
  currentUrl: string,
  currentPageNumber: number
): { url: string | null; failedCount: number } {
  const href = $("link[rel='next']").first().attr("href") ?? null;

  if (!href) {
    return { url: null, failedCount: 0 };
  }

  const url = normalizeEventbriteDiscoveryUrl(href, currentUrl);

  if (!url) {
    return { url: null, failedCount: 1 };
  }

  const nextPageNumber = Number(new URL(url).searchParams.get("page"));

  return nextPageNumber === currentPageNumber + 1
    ? { url, failedCount: 0 }
    : { url: null, failedCount: 1 };
}

export function parseEventbriteDiscoveryPage(input: {
  html: string;
  pageUrl: string;
}): ParsedEventbriteDiscoveryPage {
  const pageUrl = normalizeEventbriteDiscoveryUrl(input.pageUrl);

  if (!pageUrl) {
    throw new Error(`Invalid Eventbrite Perth discovery URL: ${input.pageUrl}`);
  }

  const $ = cheerio.load(input.html);
  const { events, pagination } = extractDiscoveryEventsData(
    extractEventbriteServerData(input.html)
  );
  const itemListEvents = extractItemListEvents($);
  const listings: EventbriteDiscoveryListing[] = [];
  const seenIds = new Set<string>();
  let failedCount = itemListEvents.size === 0 ? 1 : 0;

  for (const event of events) {
    const externalId = getDiscoveryEventId(event);
    const eventUrl = normalizeEventbriteEventUrl(event.url, externalId ?? undefined);

    if (
      !externalId ||
      !eventUrl ||
      itemListEvents.get(externalId) !== eventUrl ||
      seenIds.has(externalId)
    ) {
      failedCount += 1;
      continue;
    }

    seenIds.add(externalId);
    listings.push({ externalId, eventUrl, event });
  }

  for (const itemListEventId of itemListEvents.keys()) {
    if (!seenIds.has(itemListEventId)) {
      failedCount += 1;
    }
  }

  const nextPage = getNextPageUrl($, pageUrl, pagination.pageNumber);
  failedCount += nextPage.failedCount;

  if (pagination.pageNumber < pagination.pageCount && !nextPage.url) {
    failedCount += 1;
  }

  if (pagination.pageNumber === pagination.pageCount && nextPage.url) {
    failedCount += 1;
  }

  return {
    listings,
    pagination,
    nextPageUrl: nextPage.url,
    failedCount
  };
}

function extractStructuredEvents($: cheerio.CheerioAPI): EventbriteStructuredEvent[] {
  const events: EventbriteStructuredEvent[] = [];

  $("script[type='application/ld+json']").each((_, element) => {
    const content = $(element).text().trim();

    if (!content) {
      return;
    }

    try {
      const parsed = JSON.parse(content) as JsonValue;

      for (const entry of flattenJsonLd(parsed)) {
        if (isRecord(entry) && hasEventJsonLdType(entry["@type"])) {
          events.push(entry as EventbriteStructuredEvent);
        }
      }
    } catch {
      // Ignore unrelated malformed JSON-LD blocks.
    }
  });

  return events;
}

function getStructuredEventForListing(
  $: cheerio.CheerioAPI,
  externalId: string
): EventbriteStructuredEvent {
  const candidates = extractStructuredEvents($).filter((event) => {
    const eventUrl = normalizeEventbriteEventUrl(event.url, externalId);
    return Boolean(eventUrl);
  });

  if (candidates.length !== 1) {
    throw new Error(
      `Eventbrite detail page did not resolve uniquely to event ${externalId}`
    );
  }

  return candidates[0]!;
}

function getTagDisplayValues(tag: EventbriteDiscoveryTag): string[] {
  return [
    tag.prefix,
    tag.tag,
    tag.display_name,
    tag.displayName,
    tag.localized?.display_name,
    tag.localized?.displayName
  ]
    .map((value) => normalizeWhitespace(value ?? ""))
    .filter(Boolean);
}

function getTagsForPrefix(
  event: EventbriteDiscoveryEvent,
  expectedPrefix: string
): string[] {
  const normalizedPrefix = normalizeKeywordText(expectedPrefix);

  return (event.tags ?? []).flatMap((tag) => {
    const prefix = normalizeKeywordText(tag.prefix);
    return prefix === normalizedPrefix ? getTagDisplayValues(tag).slice(1) : [];
  });
}

function hasMusicCategory(event: EventbriteDiscoveryEvent): boolean {
  return (event.tags ?? []).some((tag) => {
    if (normalizeKeywordText(tag.prefix) !== "eventbritecategory") {
      return false;
    }

    return getTagDisplayValues(tag).some((value) => {
      const normalized = normalizeKeywordText(value);
      return normalized === "music" || normalized === "103";
    });
  });
}

function getEventFormat(event: EventbriteDiscoveryEvent): string {
  return normalizeKeywordText(
    getTagsForPrefix(event, "EventbriteFormat").find(Boolean) ?? ""
  );
}

function getDiscoveryAddress(
  event: EventbriteDiscoveryEvent
): EventbriteDiscoveryAddress {
  return event.primary_venue?.address ?? {};
}

function normalizeCountry(value: unknown): string {
  if (typeof value === "string") {
    return normalizeKeywordText(value);
  }

  return isRecord(value) && typeof value.name === "string"
    ? normalizeKeywordText(value.name)
    : "";
}

function isWesternAustraliaEvent(input: {
  discovery: EventbriteDiscoveryEvent;
  structuredEvent: EventbriteStructuredEvent;
}): boolean {
  const structuredAddress =
    isRecord(input.structuredEvent.location?.address) &&
    !Array.isArray(input.structuredEvent.location?.address)
      ? (input.structuredEvent.location?.address as EventbriteStructuredAddress)
      : null;
  const discoveryAddress = getDiscoveryAddress(input.discovery);
  const region = normalizeKeywordText(
    structuredAddress?.addressRegion ??
      discoveryAddress.region_code ??
      discoveryAddress.region ??
      ""
  );
  const country = normalizeCountry(
    structuredAddress?.addressCountry ??
      discoveryAddress.country_code ??
      discoveryAddress.country
  );

  return (
    (region === "wa" || region === "western australia") &&
    (country === "au" || country === "australia") &&
    input.discovery.timezone === PERTH_TIMEZONE
  );
}

function isOfflineEvent(input: {
  discovery: EventbriteDiscoveryEvent;
  structuredEvent: EventbriteStructuredEvent;
}): boolean {
  if (input.discovery.is_online_event === true) {
    return false;
  }

  const modes = Array.isArray(input.structuredEvent.eventAttendanceMode)
    ? input.structuredEvent.eventAttendanceMode
    : [input.structuredEvent.eventAttendanceMode];
  const normalizedModes = modes
    .filter((mode): mode is string => typeof mode === "string")
    .map((mode) => mode.toLowerCase());

  return (
    normalizedModes.some((mode) => mode.includes("offlineeventattendancemode")) &&
    !normalizedModes.some((mode) => mode.includes("onlineeventattendancemode"))
  );
}

function getPerformerNames(
  value:
    | EventbriteStructuredEvent["performer"]
    | EventbriteStructuredEvent["performers"]
): string[] {
  const performers = Array.isArray(value) ? value : value ? [value] : [];

  return performers
    .map((performer) =>
      typeof performer === "string"
        ? normalizeWhitespace(performer)
        : normalizeWhitespace((performer as EventbriteStructuredPerformer).name ?? "")
    )
    .filter(Boolean);
}

export function extractEventbriteArtists(
  structuredEvent: EventbriteStructuredEvent,
  title: string
) {
  const artists = [
    ...getPerformerNames(structuredEvent.performer),
    ...getPerformerNames(structuredEvent.performers)
  ];
  const extraction = createArtistExtraction(artists, "structured");

  return extraction.artistExtractionKind === "unknown"
    ? extraction
    : {
        ...extraction,
        artists: preferArtistDisplayNamesFromTitle(extraction.artists, title)
      };
}

export function isAcceptedEventbriteMusicEvent(input: {
  discovery: EventbriteDiscoveryEvent;
  structuredEvent: EventbriteStructuredEvent;
  title: string;
  artists: string[];
}): boolean {
  if (
    !hasMusicCategory(input.discovery) ||
    !isOfflineEvent(input) ||
    !isWesternAustraliaEvent(input)
  ) {
    return false;
  }

  const format = getEventFormat(input.discovery);
  const hardRejectText = [
    input.title,
    input.discovery.summary ?? "",
    format
  ].join(" ");

  if (
    HARD_REJECT_FORMATS.has(format) ||
    HARD_REJECT_PATTERNS.some((pattern) => pattern.test(hardRejectText))
  ) {
    return false;
  }

  if (input.artists.length > 0 || DIRECT_MUSIC_FORMATS.has(format)) {
    return true;
  }

  if (format !== PARTY_FORMAT) {
    return false;
  }

  const partyEvidence = [
    input.title,
    input.discovery.summary ?? "",
    ...getTagsForPrefix(input.discovery, "EventbriteSubCategory"),
    ...getTagsForPrefix(input.discovery, "EventbriteOrganizer")
  ].join(" ");

  return PARTY_MUSIC_SIGNAL_PATTERNS.some((pattern) =>
    pattern.test(partyEvidence)
  );
}

function normalizeDateTime(input: {
  value: string | null | undefined;
  fallbackDate: string | null | undefined;
  fallbackTime: string | null | undefined;
  label: string;
}): { iso: string; precision: StartsAtPrecision } | null {
  const value = normalizeWhitespace(input.value ?? "");

  if (value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const fallbackTime = normalizeWhitespace(input.fallbackTime ?? "");
      const time = /^\d{2}:\d{2}(?::\d{2})?$/.test(fallbackTime)
        ? fallbackTime
        : `${String(DEFAULT_START_HOUR).padStart(2, "0")}:00:00`;
      const date = new Date(`${value}T${time}${PERTH_OFFSET_SUFFIX}`);

      if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid Eventbrite ${input.label}: ${value}`);
      }

      return {
        iso: date.toISOString(),
        precision: fallbackTime ? "exact" : "date"
      };
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Invalid Eventbrite ${input.label}: ${value}`);
    }

    return { iso: date.toISOString(), precision: "exact" };
  }

  const fallbackDate = normalizeWhitespace(input.fallbackDate ?? "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)) {
    return null;
  }

  const fallbackTime = normalizeWhitespace(input.fallbackTime ?? "");
  const time = /^\d{2}:\d{2}(?::\d{2})?$/.test(fallbackTime)
    ? fallbackTime
    : `${String(DEFAULT_START_HOUR).padStart(2, "0")}:00:00`;
  const date = new Date(`${fallbackDate}T${time}${PERTH_OFFSET_SUFFIX}`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Eventbrite ${input.label}: ${fallbackDate}`);
  }

  return {
    iso: date.toISOString(),
    precision: fallbackTime ? "exact" : "date"
  };
}

function formatPerthDateKey(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PERTH_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function normalizeAddress(input: {
  structuredAddress: EventbriteStructuredAddress | string | null | undefined;
  discoveryAddress: EventbriteDiscoveryAddress;
}): { suburb: string | null; address: string | null } {
  if (typeof input.structuredAddress === "string") {
    const address = normalizeWhitespace(input.structuredAddress) || null;
    const localityMatch = address?.match(/,\s*([^,]+)\s+WA\b/i);

    return {
      suburb: localityMatch ? normalizeWhitespace(localityMatch[1]) : null,
      address
    };
  }

  const structuredAddress = input.structuredAddress;
  const suburb = normalizeWhitespace(
    structuredAddress?.addressLocality ?? input.discoveryAddress.city ?? ""
  ) || null;
  const address = normalizeWhitespace(
    input.discoveryAddress.localized_address_display ?? ""
  ) ||
    [
      normalizeWhitespace(
        structuredAddress?.streetAddress ?? input.discoveryAddress.address_1 ?? ""
      ),
      suburb,
      normalizeWhitespace(
        structuredAddress?.addressRegion ??
          input.discoveryAddress.region_code ??
          input.discoveryAddress.region ??
          ""
      ),
      normalizeWhitespace(
        structuredAddress?.postalCode ?? input.discoveryAddress.postal_code ?? ""
      ),
      normalizeWhitespace(
        normalizeCountry(
          structuredAddress?.addressCountry ??
            input.discoveryAddress.country_code ??
            input.discoveryAddress.country
        ).toUpperCase()
      )
    ]
      .filter(Boolean)
      .join(", ") ||
    null;

  return { suburb, address };
}

function normalizeVenue(input: {
  discovery: EventbriteDiscoveryEvent;
  structuredEvent: EventbriteStructuredEvent;
}): NormalizedVenue {
  const location = input.structuredEvent.location;
  const discoveryVenue = input.discovery.primary_venue;
  const venueName = normalizeVenueName(
    normalizeWhitespace(location?.name ?? discoveryVenue?.name ?? "") ||
      "Unknown venue"
  );
  const normalizedAddress = normalizeAddress({
    structuredAddress: location?.address ?? null,
    discoveryAddress: discoveryVenue?.address ?? {}
  });

  return {
    name: venueName,
    slug: slugifyVenueName(venueName),
    suburb: normalizeVenueSuburb(venueName, normalizedAddress.suburb),
    address: normalizeVenueAddress(venueName, normalizedAddress.address),
    websiteUrl: normalizeVenueWebsiteUrl(
      venueName,
      typeof location?.url === "string" ? location.url : null
    )
  };
}

function selectImageUrl(
  structuredImage: EventbriteStructuredEvent["image"],
  discovery: EventbriteDiscoveryEvent
): string | null {
  const structuredImages = Array.isArray(structuredImage)
    ? structuredImage
    : structuredImage
      ? [structuredImage]
      : [];
  const candidates = [
    ...structuredImages.flatMap((image) => {
      if (typeof image === "string") {
        return [image];
      }

      const structured = image as EventbriteStructuredImage;
      return [structured.contentUrl, structured.url];
    }),
    discovery.image?.original?.url,
    discovery.image?.url
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.toString();
      }
    } catch {
      // Try the next image candidate.
    }
  }

  return null;
}

function normalizeEventStatus(
  value: string | null | undefined,
  discovery: EventbriteDiscoveryEvent,
  title: string
): GigStatus {
  const status = normalizeKeywordText(value);
  const normalizedTitle = normalizeKeywordText(title);

  if (
    discovery.is_cancelled === true ||
    status.includes("eventcancelled") ||
    normalizedTitle.startsWith("cancelled ")
  ) {
    return "cancelled";
  }

  if (
    status.includes("eventpostponed") ||
    status.includes("eventrescheduled") ||
    normalizedTitle.startsWith("postponed ")
  ) {
    return "postponed";
  }

  return "active";
}

export function normalizeEventbriteDetailPage(input: {
  html: string;
  eventUrl: string;
  listing: EventbriteDiscoveryListing;
}): NormalizedGig | null {
  const requestedUrl = normalizeEventbriteEventUrl(
    input.eventUrl,
    input.listing.externalId
  );

  if (!requestedUrl) {
    throw new Error(`Invalid Eventbrite event URL: ${input.eventUrl}`);
  }

  const $ = cheerio.load(input.html);
  const structuredEvent = getStructuredEventForListing(
    $,
    input.listing.externalId
  );
  const rawCanonicalUrl = $("link[rel='canonical']").first().attr("href") ?? null;
  const canonicalUrl = normalizeEventbriteEventUrl(
    rawCanonicalUrl ?? structuredEvent.url,
    input.listing.externalId
  );

  if (rawCanonicalUrl && !canonicalUrl) {
    throw new Error("Eventbrite canonical URL does not match discovery");
  }
  const sourceUrl = canonicalUrl ?? normalizeEventbriteEventUrl(
    structuredEvent.url,
    input.listing.externalId
  );
  const title = normalizeWhitespace(
    structuredEvent.name ?? input.listing.event.name ?? input.listing.event.title ?? ""
  );

  if (!sourceUrl || !title) {
    throw new Error("Eventbrite detail page is missing a canonical URL or title");
  }

  const start = normalizeDateTime({
    value: structuredEvent.startDate,
    fallbackDate: input.listing.event.start_date,
    fallbackTime: input.listing.event.start_time,
    label: "start date"
  });

  if (!start) {
    throw new Error("Eventbrite detail page is missing a start date");
  }

  const discoveryDate = normalizeWhitespace(input.listing.event.start_date ?? "");

  if (
    discoveryDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(discoveryDate) &&
    formatPerthDateKey(start.iso) !== discoveryDate
  ) {
    throw new Error("Eventbrite detail date does not match discovery");
  }

  const description = normalizeWhitespace(
    structuredEvent.description ?? input.listing.event.summary ?? ""
  ) || null;
  const artistExtraction = extractEventbriteArtists(structuredEvent, title);

  if (
    !isAcceptedEventbriteMusicEvent({
      discovery: input.listing.event,
      structuredEvent,
      title,
      artists: artistExtraction.artists
    })
  ) {
    return null;
  }

  const end = normalizeDateTime({
    value: structuredEvent.endDate,
    fallbackDate: input.listing.event.end_date,
    fallbackTime: input.listing.event.end_time,
    label: "end date"
  });
  const venue = normalizeVenue({
    discovery: input.listing.event,
    structuredEvent
  });

  return {
    sourceSlug: SOURCE_SLUG,
    externalId: input.listing.externalId,
    sourceUrl,
    imageUrl: selectImageUrl(structuredEvent.image, input.listing.event),
    title,
    description,
    status: normalizeEventStatus(
      structuredEvent.eventStatus,
      input.listing.event,
      title
    ),
    startsAt: start.iso,
    startsAtPrecision: start.precision,
    endsAt: end?.iso ?? null,
    ticketUrl: sourceUrl,
    venue,
    artists: artistExtraction.artists,
    artistExtractionKind: artistExtraction.artistExtractionKind,
    rawPayload: toJsonObject({
      discovery: input.listing.event,
      structuredEvent
    }),
    checksum: buildGigChecksum({
      sourceSlug: SOURCE_SLUG,
      startsAt: start.iso,
      title,
      venueSlug: venue.slug,
      sourceUrl
    })
  };
}

export function repairEventbriteArtists(rawPayload: unknown) {
  if (!isRecord(rawPayload) || !isRecord(rawPayload.structuredEvent)) {
    return unknownArtistExtraction();
  }

  const structuredEvent = rawPayload.structuredEvent as EventbriteStructuredEvent;
  return extractEventbriteArtists(
    structuredEvent,
    normalizeWhitespace(structuredEvent.name ?? "")
  );
}
