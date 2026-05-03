import * as cheerio from "cheerio";

import {
  buildGigChecksum,
  normalizeWhitespace,
  type GigStatus,
  type JsonObject,
  type NormalizedGig,
  type NormalizedVenue
} from "@perth-gig-finder/shared";

import { unknownArtistExtraction } from "../artist-utils";
import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_ORIGIN = "https://www.ellingtonjazz.com.au";
const SOURCE_URL = `${SOURCE_ORIGIN}/all-shows/`;
const EVENTS_API_URL = `${SOURCE_ORIGIN}/wp-json/wp/v2/tc_events`;
const REQUEST_TIMEOUT_MS = 20_000;
const DETAIL_FETCH_BATCH_SIZE = 4;
const PERTH_OFFSET_SUFFIX = "+08:00";
const DAY_MS = 24 * 60 * 60 * 1000;

const VENUE: NormalizedVenue = {
  name: "The Ellington Jazz Club",
  slug: "the-ellington-jazz-club",
  suburb: "Perth",
  address: "193 Beaufort St, Perth WA 6000",
  websiteUrl: "https://www.ellingtonjazz.com.au/"
};

const MONTHS: ReadonlyMap<string, number> = new Map(
  [
    ["january", 1],
    ["jan", 1],
    ["february", 2],
    ["feb", 2],
    ["march", 3],
    ["mar", 3],
    ["april", 4],
    ["apr", 4],
    ["may", 5],
    ["june", 6],
    ["jun", 6],
    ["july", 7],
    ["jul", 7],
    ["august", 8],
    ["aug", 8],
    ["september", 9],
    ["sep", 9],
    ["sept", 9],
    ["october", 10],
    ["oct", 10],
    ["november", 11],
    ["nov", 11],
    ["december", 12],
    ["dec", 12]
  ] as const
);

export interface EllingtonRestEvent {
  id?: number;
  link?: string;
  title?: {
    rendered?: string;
  };
  content?: {
    rendered?: string;
  };
  featured_media?: number;
  _embedded?: {
    "wp:featuredmedia"?: EllingtonRestMedia[];
    "wp:term"?: EllingtonRestTerm[][];
  };
}

interface EllingtonRestMedia {
  source_url?: string;
  media_details?: {
    sizes?: Record<string, { source_url?: string }>;
  };
}

interface EllingtonRestTerm {
  name?: string;
  taxonomy?: string;
}

export interface EllingtonEventBundle {
  event: EllingtonRestEvent;
  detailHtml: string;
}

export interface EllingtonEventTimes {
  startsAt: string;
  endsAt: string | null;
  eventStartText: string;
  eventDateRangeText: string | null;
}

interface EllingtonDetailFetchTarget {
  event: EllingtonRestEvent;
  sourceUrl: string;
}

interface EllingtonDetailFetchResult {
  bundle: EllingtonEventBundle | null;
  failedCount: number;
}

function normalizeUrl(value: string | null | undefined): string | null {
  const normalized = normalizeWhitespace(value ?? "");

  if (!normalized) {
    return null;
  }

  try {
    const url = new URL(normalized, SOURCE_ORIGIN);

    for (const param of [...url.searchParams.keys()]) {
      if (param.startsWith("utm_")) {
        url.searchParams.delete(param);
      }
    }

    return url.toString();
  } catch {
    return normalized;
  }
}

function normalizeEllingtonImageUrl(value: string | null | undefined): string | null {
  const imageUrl = normalizeUrl(value);

  if (!imageUrl) {
    return null;
  }

  try {
    const url = new URL(imageUrl);

    if (
      url.hostname !== new URL(SOURCE_ORIGIN).hostname ||
      !url.pathname.startsWith("/wp-content/uploads/") ||
      !/\.(?:gif|jpe?g|png|webp)$/i.test(url.pathname) ||
      /(?:accessib|flag|logo|qtab|sustainable)/i.test(url.pathname)
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function toPlainText(html: string | null | undefined): string | null {
  if (!html) {
    return null;
  }

  const htmlWithSpacing = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n");
  const text = cheerio.load(`<div>${htmlWithSpacing}</div>`).text();
  const normalized = normalizeWhitespace(text);

  return normalized.length > 0 ? normalized : null;
}

export function normalizeEllingtonTitle(value: string | null | undefined): string {
  const withBreaks = (value ?? "")
    .replace(/\[br\]/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n");
  const text = cheerio.load(`<div>${withBreaks}</div>`).text();

  return normalizeWhitespace(text.replace(/\s*\n+\s*/g, " - ")).replace(
    /(?:\s+-\s+)+/g,
    " - "
  );
}

function getMonthNumber(value: string): number {
  const month = MONTHS.get(value.toLowerCase());

  if (!month) {
    throw new Error(`Invalid The Ellington month: ${value}`);
  }

  return month;
}

function normalizeHour(hour: number, meridiem: string | null): number {
  if (!Number.isInteger(hour)) {
    throw new Error(`Invalid The Ellington hour: ${hour}`);
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      throw new Error(`Invalid The Ellington 12-hour time: ${hour}${meridiem}`);
    }

    const normalizedHour = hour % 12;
    return meridiem.toLowerCase() === "pm" ? normalizedHour + 12 : normalizedHour;
  }

  if (hour < 0 || hour > 23) {
    throw new Error(`Invalid The Ellington 24-hour time: ${hour}`);
  }

  return hour;
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
    throw new Error(`Invalid The Ellington timestamp: ${timestamp}`);
  }

  return date.toISOString();
}

export function parseEllingtonDateTime(value: string): string {
  const normalized = normalizeWhitespace(value);
  const monthFirstMatch = normalized.match(
    /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i
  );
  const dayFirstMatch = normalized.match(
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i
  );

  const parts = monthFirstMatch
    ? {
        month: getMonthNumber(monthFirstMatch[1]),
        day: Number(monthFirstMatch[2]),
        year: Number(monthFirstMatch[3]),
        hour: Number(monthFirstMatch[4]),
        minute: Number(monthFirstMatch[5] ?? "0"),
        meridiem: monthFirstMatch[6] ?? null
      }
    : dayFirstMatch
      ? {
          day: Number(dayFirstMatch[1]),
          month: getMonthNumber(dayFirstMatch[2]),
          year: Number(dayFirstMatch[3]),
          hour: Number(dayFirstMatch[4]),
          minute: Number(dayFirstMatch[5] ?? "0"),
          meridiem: dayFirstMatch[6] ?? null
        }
      : null;

  if (!parts) {
    throw new Error(`Invalid The Ellington event date/time: ${value}`);
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  if (
    !Number.isInteger(parts.year) ||
    !Number.isInteger(parts.day) ||
    !Number.isInteger(parts.minute) ||
    parts.minute < 0 ||
    parts.minute > 59 ||
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    throw new Error(`Invalid The Ellington event date/time: ${value}`);
  }

  return buildPerthDateTime({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: normalizeHour(parts.hour, parts.meridiem),
    minute: parts.minute
  });
}

function parseEllingtonEventRange(value: string): {
  startsAt: string;
  endsAt: string | null;
} | null {
  const normalized = normalizeWhitespace(value);
  const match = normalized.match(
    /^(\d{1,2}\s+[A-Za-z]+\s+\d{4})\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\s*-\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))$/i
  );

  if (!match) {
    return null;
  }

  const [, dateText, startTimeText, endTimeText] = match;
  const startsAt = parseEllingtonDateTime(`${dateText} ${startTimeText}`);
  const rawEndsAt = parseEllingtonDateTime(`${dateText} ${endTimeText}`);
  const endsAtDate = new Date(rawEndsAt);

  if (endsAtDate.getTime() <= new Date(startsAt).getTime()) {
    endsAtDate.setTime(endsAtDate.getTime() + DAY_MS);
  }

  return {
    startsAt,
    endsAt: endsAtDate.toISOString()
  };
}

export function extractEllingtonEventTimes(html: string): EllingtonEventTimes {
  const $ = cheerio.load(html);
  const fieldTexts = $(".jet-listing-dynamic-field__content")
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get();
  const bodyText = normalizeWhitespace($("body").text());
  const rangeText =
    normalizeWhitespace($(".tc_event_date_title_front").first().text()) || null;
  const range = rangeText ? parseEllingtonEventRange(rangeText) : null;
  let eventStartText: string | null = null;

  for (const candidate of [...fieldTexts, bodyText]) {
    const match = candidate.match(
      /Event Start Date\s*&\s*T[Ii]me:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4}\s+\d{1,2}:\d{2}(?:\s*(?:am|pm))?)/i
    );

    if (match) {
      eventStartText = normalizeWhitespace(match[1]);
      break;
    }
  }

  if (!eventStartText && !range) {
    throw new Error("The Ellington event detail page did not contain a start time");
  }

  return {
    startsAt: eventStartText ? parseEllingtonDateTime(eventStartText) : range!.startsAt,
    endsAt: range?.endsAt ?? null,
    eventStartText: eventStartText ?? rangeText!,
    eventDateRangeText: rangeText
  };
}

function extractCategories(event: EllingtonRestEvent): string[] {
  const terms = event._embedded?.["wp:term"]?.flat() ?? [];
  const categories = new Map<string, string>();

  for (const term of terms) {
    if (term.taxonomy && term.taxonomy !== "event_category") {
      continue;
    }

    const category = normalizeWhitespace(term.name ?? "");

    if (category) {
      categories.set(category.toLowerCase(), category);
    }
  }

  return [...categories.values()];
}

function extractFirstSrcsetImageUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  for (const part of value.split(",")) {
    const candidate = part.trim().split(/\s+/)[0];
    const imageUrl = normalizeEllingtonImageUrl(candidate);

    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}

function extractDetailPageImageUrl(html: string): string | null {
  const $ = cheerio.load(html);
  const metaImageSelectors = [
    { selector: 'meta[property="og:image:secure_url"]', attr: "content" },
    { selector: 'meta[property="og:image"]', attr: "content" },
    { selector: 'meta[name="twitter:image"]', attr: "content" },
    { selector: 'link[rel="preload"][as="image"]', attr: "href" }
  ];

  for (const { selector, attr } of metaImageSelectors) {
    const imageUrl = normalizeEllingtonImageUrl($(selector).first().attr(attr));

    if (imageUrl) {
      return imageUrl;
    }
  }

  for (const element of $(".elementor-widget-theme-post-featured-image img").toArray()) {
    const image = $(element);
    const candidates = [
      normalizeEllingtonImageUrl(image.attr("src")),
      normalizeEllingtonImageUrl(image.attr("data-src")),
      extractFirstSrcsetImageUrl(image.attr("srcset")),
      extractFirstSrcsetImageUrl(image.attr("data-srcset"))
    ];

    for (const imageUrl of candidates) {
      if (imageUrl) {
        return imageUrl;
      }
    }
  }

  return null;
}

function extractImageUrl(
  event: EllingtonRestEvent,
  detailHtml: string
): string | null {
  const media = event._embedded?.["wp:featuredmedia"]?.[0];
  const sizes = media?.media_details?.sizes ?? {};
  const candidates = [
    media?.source_url,
    sizes.full?.source_url,
    sizes.large?.source_url,
    sizes.tc_all_events_image?.source_url,
    sizes.medium_large?.source_url
  ];

  for (const candidate of candidates) {
    const imageUrl = normalizeEllingtonImageUrl(candidate);

    if (imageUrl) {
      return imageUrl;
    }
  }

  return extractDetailPageImageUrl(detailHtml);
}

function normalizeEllingtonStatus(title: string, description: string | null): GigStatus {
  const statusText = `${title} ${description ?? ""}`;

  if (/\bcancell?ed\b/i.test(statusText)) {
    return "cancelled";
  }

  if (/\bpostponed\b|\brescheduled\b/i.test(statusText)) {
    return "postponed";
  }

  return "active";
}

export function normalizeEllingtonEvent(
  event: EllingtonRestEvent,
  detailHtml: string
): NormalizedGig {
  const eventId = event.id;

  if (typeof eventId !== "number" || !Number.isInteger(eventId)) {
    throw new Error("The Ellington event is missing an id");
  }

  const title = normalizeEllingtonTitle(event.title?.rendered);
  const sourceUrl = normalizeUrl(event.link);

  if (!title || !sourceUrl) {
    throw new Error("The Ellington event is missing a title or source URL");
  }

  const times = extractEllingtonEventTimes(detailHtml);
  const description = toPlainText(event.content?.rendered);
  const imageUrl = extractImageUrl(event, detailHtml);
  const categories = extractCategories(event);
  const artistExtraction = unknownArtistExtraction();
  const rawPayload: JsonObject = {
    source: "wordpress-rest",
    eventId,
    title,
    sourceUrl,
    imageUrl,
    categories,
    eventStartText: times.eventStartText,
    eventDateRangeText: times.eventDateRangeText,
    contentHtml: event.content?.rendered ?? null
  };

  return {
    sourceSlug: "the-ellington",
    externalId: String(eventId),
    sourceUrl,
    imageUrl,
    title,
    description,
    status: normalizeEllingtonStatus(title, description),
    startsAt: times.startsAt,
    startsAtPrecision: "exact",
    endsAt: times.endsAt,
    ticketUrl: sourceUrl,
    venue: VENUE,
    artists: artistExtraction.artists,
    artistExtractionKind: artistExtraction.artistExtractionKind,
    rawPayload,
    checksum: buildGigChecksum({
      sourceSlug: "the-ellington",
      startsAt: times.startsAt,
      title,
      venueSlug: VENUE.slug,
      sourceUrl
    })
  };
}

export function parseEllingtonEvents(
  bundles: EllingtonEventBundle[]
): SourceAdapterResult {
  const gigs: NormalizedGig[] = [];
  let failedCount = 0;

  for (const bundle of bundles) {
    try {
      gigs.push(normalizeEllingtonEvent(bundle.event, bundle.detailHtml));
    } catch {
      failedCount += 1;
    }
  }

  return { gigs, failedCount };
}

function buildEventsApiUrl(page: number): string {
  const params = new URLSearchParams({
    per_page: "100",
    _embed: "1",
    page: String(page)
  });

  return `${EVENTS_API_URL}?${params.toString()}`;
}

async function fetchEllingtonEvents(fetchImpl: typeof fetch): Promise<EllingtonRestEvent[]> {
  const events: EllingtonRestEvent[] = [];
  let page = 1;
  let totalPages = 1;

  do {
    const response = await fetchImpl(buildEventsApiUrl(page), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(`The Ellington events API returned status ${response.status}`);
    }

    const payload = (await response.json()) as unknown;

    if (!Array.isArray(payload)) {
      throw new Error("The Ellington events API payload was not an array");
    }

    events.push(...(payload as EllingtonRestEvent[]));
    const headerTotalPages = Number(response.headers.get("x-wp-totalpages"));
    totalPages =
      Number.isFinite(headerTotalPages) && headerTotalPages > 0
        ? headerTotalPages
        : totalPages;
    page += 1;
  } while (page <= totalPages);

  return events;
}

async function fetchEllingtonEventDetail(input: {
  event: EllingtonRestEvent;
  sourceUrl: string;
  fetchImpl: typeof fetch;
}): Promise<EllingtonDetailFetchResult> {
  try {
    const response = await input.fetchImpl(input.sourceUrl, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
      throw new Error(`The Ellington detail page returned status ${response.status}`);
    }

    return {
      bundle: {
        event: input.event,
        detailHtml: await response.text()
      },
      failedCount: 0
    };
  } catch {
    return {
      bundle: null,
      failedCount: 1
    };
  }
}

export const theEllingtonSource: SourceAdapter = {
  slug: "the-ellington",
  name: "The Ellington",
  baseUrl: SOURCE_URL,
  priority: 100,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch) {
    const events = await fetchEllingtonEvents(fetchImpl);
    const bundles: EllingtonEventBundle[] = [];
    const detailTargets: EllingtonDetailFetchTarget[] = [];
    let failedCount = 0;

    for (const event of events) {
      const sourceUrl = normalizeUrl(event.link);

      if (!sourceUrl) {
        failedCount += 1;
        continue;
      }

      detailTargets.push({ event, sourceUrl });
    }

    for (
      let detailIndex = 0;
      detailIndex < detailTargets.length;
      detailIndex += DETAIL_FETCH_BATCH_SIZE
    ) {
      const batchResults = await Promise.all(
        detailTargets
          .slice(detailIndex, detailIndex + DETAIL_FETCH_BATCH_SIZE)
          .map((target) =>
            fetchEllingtonEventDetail({
              event: target.event,
              sourceUrl: target.sourceUrl,
              fetchImpl
            })
          )
      );

      for (const result of batchResults) {
        failedCount += result.failedCount;

        if (result.bundle) {
          bundles.push(result.bundle);
        }
      }
    }

    const parsed = parseEllingtonEvents(bundles);

    return {
      gigs: parsed.gigs,
      failedCount: failedCount + parsed.failedCount
    };
  }
};
