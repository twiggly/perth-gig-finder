import {
  buildGigChecksum,
  normalizeVenueName,
  normalizeVenueWebsiteUrl,
  normalizeWhitespace,
  slugify,
  slugifyVenueName,
  type JsonObject,
  type NormalizedGig,
  type NormalizedVenue,
  type StartsAtPrecision
} from "@perth-gig-finder/shared";

import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_URL = "https://www.williamstreetbird.com/comingup";
const FEED_URL =
  "https://script.google.com/macros/s/AKfycbxdagRDbsT5jS3IG1w9Kl7N0qia6piKKcp8BE_n4y9n9XYItKKgXmYHX6XX70fDmMP5pw/exec";
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_START_HOUR = 12;
const PERTH_OFFSET_SUFFIX = "+08:00";
const VENUE_NAME = "The Bird";
const VENUE_SUBURB = "Northbridge";
const VENUE_ADDRESS = "181 William Street, Northbridge WA 6003";
const VENUE_WEBSITE_URL = "https://www.williamstreetbird.com/";
const PLACEHOLDER_TITLES = new Set(["past event", "tomorrow"]);

export interface TheBirdFeedRow {
  Date?: string;
  Day?: string;
  "Event Title"?: string;
  Info?: string;
  "Ticket Link"?: string;
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

function isBlankRow(row: TheBirdFeedRow): boolean {
  return Object.values(row).every((value) => !normalizeWhitespace(value ?? ""));
}

function isPlaceholderRow(row: TheBirdFeedRow): boolean {
  const title = normalizeWhitespace(row["Event Title"] ?? "").toLowerCase();
  return PLACEHOLDER_TITLES.has(title);
}

function parseDateParts(value: string): { year: number; month: number; day: number } {
  const trimmed = normalizeWhitespace(value);
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    throw new Error(`Invalid The Bird date: ${value}`);
  }

  const [, dayText, monthText, yearText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid The Bird date: ${value}`);
  }

  return { year, month, day };
}

function formatIsoDate(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function isPastLocalDate(parts: { year: number; month: number; day: number }): boolean {
  const now = new Date();
  const perthParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Perth",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const perthYear = Number(
    perthParts.find((part) => part.type === "year")?.value ?? ""
  );
  const perthMonth = Number(
    perthParts.find((part) => part.type === "month")?.value ?? ""
  );
  const perthDay = Number(
    perthParts.find((part) => part.type === "day")?.value ?? ""
  );

  if (
    !Number.isInteger(perthYear) ||
    !Number.isInteger(perthMonth) ||
    !Number.isInteger(perthDay)
  ) {
    throw new Error("Could not determine the current Perth date");
  }

  const todayKey = `${perthYear}-${String(perthMonth).padStart(2, "0")}-${String(perthDay).padStart(2, "0")}`;

  return formatIsoDate(parts) < todayKey;
}

function buildPerthDateTime(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}): string {
  const timestamp = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}:00${PERTH_OFFSET_SUFFIX}`;
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid The Bird timestamp: ${timestamp}`);
  }

  return date.toISOString();
}

interface ParsedStartTime {
  hour: number;
  minute: number;
  startsAtPrecision: StartsAtPrecision;
}

function toTwentyFourHour(hour: number, meridiem: string): number {
  const normalizedHour = hour % 12;

  if (meridiem.toLowerCase() === "pm") {
    return normalizedHour + 12;
  }

  return normalizedHour;
}

export function parseTheBirdStartTime(info: string | null | undefined): ParsedStartTime | null {
  const normalized = normalizeWhitespace(info ?? "");

  if (!normalized) {
    return null;
  }

  const doorsMatch = normalized.match(
    /\bdoors?\s*(?:open\s*)?(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i
  );

  const match =
    doorsMatch ??
    normalized.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 1 ||
    hour > 12 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return {
    hour: toTwentyFourHour(hour, match[3]),
    minute,
    startsAtPrecision: "exact"
  };
}

function normalizeTicketUrl(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value ?? "");

  if (!normalized || normalized.toLowerCase() === "free") {
    return null;
  }

  return normalizeUrl(normalized);
}

function buildVenue(): NormalizedVenue {
  const venueName = normalizeVenueName(VENUE_NAME);

  return {
    name: venueName,
    slug: slugifyVenueName(venueName),
    suburb: VENUE_SUBURB,
    address: VENUE_ADDRESS,
    websiteUrl: normalizeVenueWebsiteUrl(venueName, VENUE_WEBSITE_URL)
  };
}

function buildSyntheticIdentity(parts: { year: number; month: number; day: number }, title: string): {
  externalId: string;
  sourceUrl: string;
} {
  const identity = `${formatIsoDate(parts)}-${slugify(title)}`;

  return {
    externalId: identity,
    sourceUrl: `${SOURCE_URL}#${identity}`
  };
}

export function normalizeTheBirdRow(row: TheBirdFeedRow): NormalizedGig | null {
  if (isBlankRow(row) || isPlaceholderRow(row)) {
    return null;
  }

  const title = normalizeWhitespace(row["Event Title"] ?? "");

  if (!title) {
    return null;
  }

  const dateParts = parseDateParts(row.Date ?? "");

  if (isPastLocalDate(dateParts)) {
    return null;
  }

  const venue = buildVenue();
  const description = normalizeWhitespace(row.Info ?? "") || null;
  const time = parseTheBirdStartTime(description);
  const startsAt = time
    ? buildPerthDateTime({
        ...dateParts,
        hour: time.hour,
        minute: time.minute
      })
    : buildPerthDateTime({
        ...dateParts,
        hour: DEFAULT_START_HOUR,
        minute: 0
      });
  const startsAtPrecision = time?.startsAtPrecision ?? "date";
  const { externalId, sourceUrl } = buildSyntheticIdentity(dateParts, title);
  const ticketUrl = normalizeTicketUrl(row["Ticket Link"]);
  const rawPayload: JsonObject = {
    Date: row.Date ?? "",
    Day: row.Day ?? "",
    "Event Title": row["Event Title"] ?? "",
    Info: row.Info ?? "",
    "Ticket Link": row["Ticket Link"] ?? "",
    derivedExternalId: externalId,
    derivedSourceUrl: sourceUrl,
    derivedStartsAt: startsAt,
    derivedStartsAtPrecision: startsAtPrecision
  };

  return {
    sourceSlug: "the-bird",
    externalId,
    sourceUrl,
    imageUrl: null,
    title,
    description,
    status: "active",
    startsAt,
    startsAtPrecision,
    endsAt: null,
    ticketUrl,
    venue,
    artists: [title],
    rawPayload,
    checksum: buildGigChecksum({
      sourceSlug: "the-bird",
      startsAt,
      title,
      venueSlug: venue.slug,
      sourceUrl
    })
  };
}

export function parseTheBirdFeedRows(rows: TheBirdFeedRow[]): SourceAdapterResult {
  const gigs: NormalizedGig[] = [];
  let failedCount = 0;

  for (const row of rows) {
    try {
      const normalized = normalizeTheBirdRow(row);

      if (normalized) {
        gigs.push(normalized);
      }
    } catch {
      failedCount += 1;
    }
  }

  return { gigs, failedCount };
}

export const theBirdSource: SourceAdapter = {
  slug: "the-bird",
  name: "The Bird",
  baseUrl: SOURCE_URL,
  priority: 100,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch) {
    const response = await fetchImpl(FEED_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(`The Bird feed returned status ${response.status}`);
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
      throw new Error("The Bird feed payload was not an array");
    }

    return parseTheBirdFeedRows(payload as TheBirdFeedRow[]);
  }
};
