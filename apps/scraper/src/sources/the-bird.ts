import * as cheerio from "cheerio";

import {
  areCanonicalTitlesCompatible,
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

import {
  createArtistExtraction,
  getArtistExtractionKindRank,
  unknownArtistExtraction
} from "../artist-utils";
import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_URL = "https://www.williamstreetbird.com/comingup";
const WHATSON_URL = "https://www.williamstreetbird.com/whatson";
const FEED_URL =
  "https://script.google.com/macros/s/AKfycbxdagRDbsT5jS3IG1w9Kl7N0qia6piKKcp8BE_n4y9n9XYItKKgXmYHX6XX70fDmMP5pw/exec";
const WHATSON_FEED_URL =
  "https://script.google.com/macros/s/AKfycbzzgynedUsONCcojblT4OlkSN8rhGlCQ7sW5j4izIwA8pK7sKWpEOCCuonK7RqiX-Ee/exec";
const REQUEST_TIMEOUT_MS = 15_000;
const LINKED_EVENT_TIMEOUT_MS = 10_000;
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

export interface TheBirdWhatsOnRow {
  Date?: string;
  Day?: string;
  Time?: string;
  Price?: string | number;
  Vibe?: string;
  Title?: string;
  Featuring?: string;
  Description?: string;
  "Ticket Link"?: string;
}

const THE_BIRD_WEEKLY_NON_MUSIC_PATTERNS = [
  /\bimprov\b/i,
  /\bdnd\b/i,
  /\bcomedy\b/i,
  /\btrivia\b/i,
  /\bquiz\b/i
];

const THE_BIRD_WEEKLY_MUSIC_PATTERNS = [
  /\blive music\b/i,
  /\bsingle launch\b/i,
  /\bep launch\b/i,
  /\balbum launch\b/i,
  /\bjazz\b/i,
  /\bnoise\b/i,
  /\bambient\b/i,
  /\belectronic\b/i,
  /\btechno\b/i,
  /\bdance\b/i,
  /\bfunk\b/i,
  /\bsoul\b/i,
  /\bindie\b/i,
  /\balt\b/i,
  /\brock\b/i,
  /\bmetal\b/i,
  /\bparty\b/i,
  /\bdj\b/i,
  /\bdrum(?: and| &) bass\b/i,
  /\bdnb\b/i,
  /\bcourtyard\b/i,
  /\bcarpark\b/i
];

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
  const match = trimmed.match(/^(\d{2})([/.])(\d{2})\2(\d{2}|\d{4})$/);

  if (!match) {
    throw new Error(`Invalid The Bird date: ${value}`);
  }

  const [, dayText, , monthText, rawYearText] = match;
  const yearText =
    rawYearText.length === 2 ? `20${rawYearText}` : rawYearText;
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

function isHumanitixHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "humanitix.com" || normalized.endsWith(".humanitix.com");
}

export function normalizeTheBirdLinkedEventUrl(value: string | null | undefined): string | null {
  const ticketUrl = normalizeTicketUrl(value);

  if (!ticketUrl) {
    return null;
  }

  try {
    const url = new URL(ticketUrl);

    if (!isHumanitixHost(url.hostname)) {
      return null;
    }

    url.hash = "";
    url.search = "";

    if (url.pathname.endsWith("/tickets")) {
      url.pathname = url.pathname.slice(0, -"/tickets".length);
    }

    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    return url.toString();
  } catch {
    return null;
  }
}

function parseJsonValue(value: string | null | undefined): JsonObject | string | Array<JsonObject | string> | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as JsonObject | string | Array<JsonObject | string>;
  } catch {
    return null;
  }
}

function findImageUrlInJson(value: unknown): string | null {
  if (typeof value === "string") {
    return normalizeUrl(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const imageUrl = findImageUrlInJson(item);

      if (imageUrl) {
        return imageUrl;
      }
    }

    return null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const directImageUrl =
    findImageUrlInJson(record.image) ??
    findImageUrlInJson(record.thumbnailUrl);

  if (directImageUrl) {
    return directImageUrl;
  }

  for (const nestedValue of Object.values(record)) {
    const imageUrl = findImageUrlInJson(nestedValue);

    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

export function extractTheBirdLinkedImageUrl(html: string): string | null {
  const $ = cheerio.load(html);

  return (
    normalizeUrl($("meta[property='og:image']").attr("content")) ??
    normalizeUrl($("meta[name='twitter:image']").attr("content")) ??
    findImageUrlInJson(
      $("script[type='application/ld+json']")
        .toArray()
        .map((element) => parseJsonValue($(element).html()))
    )
  );
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

function buildSyntheticIdentity(
  parts: { year: number; month: number; day: number },
  title: string,
  sourceUrlBase = SOURCE_URL
): {
  externalId: string;
  sourceUrl: string;
} {
  const identity = `${formatIsoDate(parts)}-${slugify(title)}`;

  return {
    externalId: identity,
    sourceUrl: `${sourceUrlBase}#${identity}`
  };
}

function buildTheBirdGig(input: {
  title: string;
  description: string | null;
  dateText: string;
  ticketUrl: string | null;
  timeText: string | null;
  artists: string[];
  rawPayload: JsonObject;
  sourceUrlBase?: string;
}): NormalizedGig | null {
  const title = normalizeWhitespace(input.title);

  if (!title) {
    return null;
  }

  const dateParts = parseDateParts(input.dateText);

  if (isPastLocalDate(dateParts)) {
    return null;
  }

  const venue = buildVenue();
  const description = input.description;
  const time = parseTheBirdStartTime(input.timeText ?? description);
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
  const { externalId, sourceUrl } = buildSyntheticIdentity(
    dateParts,
    title,
    input.sourceUrlBase
  );
  const rawPayload: JsonObject = {
    ...input.rawPayload,
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
    ticketUrl: input.ticketUrl,
    venue,
    artists: input.artists,
    artistExtractionKind: input.artists.length > 0 ? "explicit_lineup" : "unknown",
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

export function normalizeTheBirdRow(row: TheBirdFeedRow): NormalizedGig | null {
  if (isBlankRow(row) || isPlaceholderRow(row)) {
    return null;
  }

  const description = normalizeWhitespace(row.Info ?? "") || null;

  return buildTheBirdGig({
    title: row["Event Title"] ?? "",
    description,
    dateText: row.Date ?? "",
    ticketUrl: normalizeTicketUrl(row["Ticket Link"]),
    timeText: description,
    artists: [],
    rawPayload: {
      Date: row.Date ?? "",
      Day: row.Day ?? "",
      "Event Title": row["Event Title"] ?? "",
      Info: row.Info ?? "",
      "Ticket Link": row["Ticket Link"] ?? "",
      feedSurface: "comingup"
    }
  });
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

export function parseTheBirdFeaturingArtists(
  value: string | null | undefined,
  title: string
): string[] {
  const normalized = normalizeWhitespace(value ?? "");

  if (!normalized || /^presented by\b/i.test(normalized)) {
    return [];
  }

  const artists = normalized
    .split(",")
    .map((artist) => normalizeWhitespace(artist))
    .filter(Boolean);
  const uniqueBySlug = new Map<string, string>();

  for (const artist of artists) {
    const artistSlug = slugify(artist);

    if (!artistSlug || artistSlug === slugify(title) || uniqueBySlug.has(artistSlug)) {
      continue;
    }

    uniqueBySlug.set(artistSlug, artist);
  }

  return createArtistExtraction([...uniqueBySlug.values()], "explicit_lineup").artists;
}

function isTheBirdWeeklyMusicRow(row: TheBirdWhatsOnRow): boolean {
  const title = normalizeWhitespace(row.Title ?? "");
  const featuringArtists = parseTheBirdFeaturingArtists(row.Featuring, title);
  const combined = normalizeWhitespace(
    [
      row.Title ?? "",
      row.Vibe ?? "",
      row.Description ?? "",
      row.Featuring ?? ""
    ].join(" ")
  );

  if (!combined) {
    return false;
  }

  if (THE_BIRD_WEEKLY_NON_MUSIC_PATTERNS.some((pattern) => pattern.test(combined))) {
    return false;
  }

  if (THE_BIRD_WEEKLY_MUSIC_PATTERNS.some((pattern) => pattern.test(combined))) {
    return true;
  }

  return featuringArtists.length >= 2;
}

export function normalizeTheBirdWhatsOnRow(row: TheBirdWhatsOnRow): NormalizedGig | null {
  const title = normalizeWhitespace(row.Title ?? "");

  if (!title || !normalizeWhitespace(row.Date ?? "")) {
    return null;
  }

  if (!isTheBirdWeeklyMusicRow(row)) {
    return null;
  }

  const description = normalizeWhitespace(row.Description ?? "") || null;
  const artists = parseTheBirdFeaturingArtists(row.Featuring, title);

  return buildTheBirdGig({
    title,
    description,
    dateText: row.Date ?? "",
    ticketUrl: normalizeTicketUrl(row["Ticket Link"]),
    timeText: normalizeWhitespace(row.Time ?? "") || null,
    artists,
    sourceUrlBase: WHATSON_URL,
    rawPayload: {
      Date: row.Date ?? "",
      Day: row.Day ?? "",
      Time: row.Time ?? "",
      Price: row.Price ?? null,
      Vibe: row.Vibe ?? "",
      Title: row.Title ?? "",
      Featuring: row.Featuring ?? "",
      Description: row.Description ?? "",
      "Ticket Link": row["Ticket Link"] ?? "",
      feedSurface: "whatson"
    }
  });
}

export function parseTheBirdWhatsOnRows(rows: TheBirdWhatsOnRow[]): SourceAdapterResult {
  const gigs: NormalizedGig[] = [];
  let failedCount = 0;

  for (const row of rows) {
    try {
      const normalized = normalizeTheBirdWhatsOnRow(row);

      if (normalized) {
        gigs.push(normalized);
      }
    } catch {
      failedCount += 1;
    }
  }

  return { gigs, failedCount };
}

function hasKnownLineupArtists(gig: NormalizedGig): boolean {
  return (
    gig.artistExtractionKind !== "unknown" &&
    getArtistExtractionKindRank(gig.artistExtractionKind) >=
      getArtistExtractionKindRank("explicit_lineup") &&
    gig.artists.length > 0
  );
}

function normalizeTheBirdFeedMergeTitle(value: string): string {
  return slugify(
    normalizeWhitespace(value)
      .replace(/\s*(?:@|at)\s+the\s+bird\b/gi, " ")
      .replace(/\s+-\s+the\s+bird\b/gi, " ")
  );
}

function areTheBirdFeedTitlesCompatible(left: string, right: string): boolean {
  if (areCanonicalTitlesCompatible(left, right)) {
    return true;
  }

  const normalizedLeft = normalizeTheBirdFeedMergeTitle(left);
  const normalizedRight = normalizeTheBirdFeedMergeTitle(right);

  return Boolean(normalizedLeft && normalizedLeft === normalizedRight);
}

function chooseLongerText(
  current: string | null,
  candidate: string | null
): string | null {
  if (!current) {
    return candidate;
  }

  if (!candidate) {
    return current;
  }

  return candidate.length > current.length ? candidate : current;
}

function mergeTheBirdGigs(current: NormalizedGig, candidate: NormalizedGig): NormalizedGig {
  const prefersCandidateTime =
    current.startsAtPrecision !== "exact" && candidate.startsAtPrecision === "exact";
  const startsAt = prefersCandidateTime ? candidate.startsAt : current.startsAt;
  const startsAtPrecision = prefersCandidateTime
    ? candidate.startsAtPrecision
    : current.startsAtPrecision;
  const description = chooseLongerText(current.description, candidate.description);
  const artists =
    hasKnownLineupArtists(current) || !hasKnownLineupArtists(candidate)
      ? current.artists
      : candidate.artists;
  const artistExtractionKind =
    hasKnownLineupArtists(current) || !hasKnownLineupArtists(candidate)
      ? current.artistExtractionKind
      : candidate.artistExtractionKind;
  const currentRawPayload =
    current.rawPayload && typeof current.rawPayload === "object" && !Array.isArray(current.rawPayload)
      ? current.rawPayload
      : {};
  const candidateRawPayload =
    candidate.rawPayload &&
    typeof candidate.rawPayload === "object" &&
    !Array.isArray(candidate.rawPayload)
      ? candidate.rawPayload
      : {};

  return {
    ...current,
    description,
    startsAt,
    startsAtPrecision,
    ticketUrl: current.ticketUrl ?? candidate.ticketUrl,
    imageUrl: current.imageUrl ?? candidate.imageUrl,
    artists,
    artistExtractionKind,
    rawPayload: {
      ...currentRawPayload,
      mergedWeeklyFeed: candidateRawPayload,
      derivedMergedFeedSurfaces: ["comingup", "whatson"]
    },
    checksum: buildGigChecksum({
      sourceSlug: "the-bird",
      startsAt,
      title: current.title,
      venueSlug: current.venue.slug,
      sourceUrl: current.sourceUrl
    })
  };
}

function mergeTheBirdFeedResults(
  primary: SourceAdapterResult,
  candidate: SourceAdapterResult
): SourceAdapterResult {
  const gigs = [...primary.gigs];

  for (const gig of candidate.gigs) {
    const existingIndex = gigs.findIndex((existingGig) => {
      if (existingGig.externalId === gig.externalId) {
        return true;
      }

      return (
        existingGig.startsAt.slice(0, 10) === gig.startsAt.slice(0, 10) &&
        areTheBirdFeedTitlesCompatible(existingGig.title, gig.title)
      );
    });

    if (existingIndex === -1) {
      gigs.push(gig);
      continue;
    }

    gigs[existingIndex] = mergeTheBirdGigs(gigs[existingIndex]!, gig);
  }

  return {
    gigs,
    failedCount: primary.failedCount + candidate.failedCount
  };
}

async function enrichTheBirdGigImage(
  gig: NormalizedGig,
  fetchImpl: typeof fetch
): Promise<NormalizedGig> {
  if (gig.imageUrl || !gig.ticketUrl) {
    return gig;
  }

  const linkedEventUrl = normalizeTheBirdLinkedEventUrl(gig.ticketUrl);

  if (!linkedEventUrl) {
    return gig;
  }

  try {
    const response = await fetchImpl(linkedEventUrl, {
      signal: AbortSignal.timeout(LINKED_EVENT_TIMEOUT_MS)
    });

    if (!response.ok) {
      return gig;
    }

    const html = await response.text();
    const imageUrl = extractTheBirdLinkedImageUrl(html);

    if (!imageUrl) {
      return gig;
    }

    const rawPayload =
      gig.rawPayload && typeof gig.rawPayload === "object" && !Array.isArray(gig.rawPayload)
        ? gig.rawPayload
        : {};

    return {
      ...gig,
      imageUrl,
      rawPayload: {
        ...rawPayload,
        derivedLinkedImageUrl: imageUrl,
        derivedLinkedImageSourceUrl: linkedEventUrl
      }
    };
  } catch {
    return gig;
  }
}

export const theBirdSource: SourceAdapter = {
  slug: "the-bird",
  name: "The Bird",
  baseUrl: SOURCE_URL,
  priority: 50,
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

    const weeklyResponse = await fetchImpl(WHATSON_FEED_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!weeklyResponse.ok) {
      throw new Error(`The Bird weekly feed returned status ${weeklyResponse.status}`);
    }

    const weeklyPayload = (await weeklyResponse.json()) as unknown;

    if (!Array.isArray(weeklyPayload)) {
      throw new Error("The Bird weekly feed payload was not an array");
    }

    const parsed = mergeTheBirdFeedResults(
      parseTheBirdFeedRows(payload as TheBirdFeedRow[]),
      parseTheBirdWhatsOnRows(weeklyPayload as TheBirdWhatsOnRow[])
    );
    const gigs: NormalizedGig[] = [];

    for (const gig of parsed.gigs) {
      gigs.push(await enrichTheBirdGigImage(gig, fetchImpl));
    }

    return {
      gigs,
      failedCount: parsed.failedCount
    };
  },
  repairArtists(rawPayload) {
    const payload =
      rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
        ? (rawPayload as {
            mergedWeeklyFeed?: {
              Featuring?: string;
              Title?: string;
            };
            Featuring?: string;
            Title?: string;
            "Event Title"?: string;
          })
        : {};
    const weeklyTitle = normalizeWhitespace(payload.mergedWeeklyFeed?.Title ?? "");

    if (payload.mergedWeeklyFeed) {
      return createArtistExtraction(
        parseTheBirdFeaturingArtists(
          payload.mergedWeeklyFeed.Featuring,
          weeklyTitle || normalizeWhitespace(payload["Event Title"] ?? payload.Title ?? "")
        ),
        "explicit_lineup"
      );
    }

    const title = normalizeWhitespace(payload.Title ?? payload["Event Title"] ?? "");
    const artists = parseTheBirdFeaturingArtists(payload.Featuring, title);

    return artists.length > 0
      ? createArtistExtraction(artists, "explicit_lineup")
      : unknownArtistExtraction();
  }
};
