import { normalizeWhitespace } from "@perth-gig-finder/shared";
import * as cheerio from "cheerio";

import type {
  TixelDiscoveryCard,
  TixelDiscoveryPage,
  TixelEventDetail
} from "./types";

export const TIXEL_BASE_URL = "https://tixel.com";
export const TIXEL_DISCOVERY_URL =
  "https://tixel.com/au/discover/Perth/music-tickets";

const TIXEL_EVENT_PATH =
  /^\/au\/[a-z0-9-]+-tickets\/(\d{4})\/(\d{2})\/(\d{2})\/[a-z0-9-]+$/;
const PERTH_DATE_FORMATTER = new Intl.DateTimeFormat("en-AU", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Australia/Perth",
  year: "numeric"
});

function getJsonLdNodes(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.flatMap(getJsonLdNodes);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const graph = getJsonLdNodes(record["@graph"]);
  return [record, ...graph];
}

function hasMusicEventType(value: unknown): boolean {
  return Array.isArray(value)
    ? value.includes("MusicEvent")
    : value === "MusicEvent";
}

function getAddressCountry(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const address = value as Record<string, unknown>;
  const country = address.addressCountry;

  if (typeof country === "string") {
    return normalizeWhitespace(country);
  }

  if (country && typeof country === "object") {
    const name = (country as Record<string, unknown>).name;
    return typeof name === "string" ? normalizeWhitespace(name) : null;
  }

  return null;
}

export function getPerthDateKey(value: string): string | null {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return null;
  }

  const parts = new Map(
    PERTH_DATE_FORMATTER.formatToParts(date).map((part) => [
      part.type,
      part.value
    ])
  );
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");

  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function normalizeTixelEventUrl(value: string): {
  dateKey: string;
  url: string;
} | null {
  let url: URL;

  try {
    url = new URL(value, TIXEL_BASE_URL);
  } catch {
    return null;
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "tixel.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  const match = TIXEL_EVENT_PATH.exec(url.pathname);

  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const candidateDate = new Date(`${year}-${month}-${day}T00:00:00Z`);

  if (
    !Number.isFinite(candidateDate.getTime()) ||
    candidateDate.toISOString().slice(0, 10) !== `${year}-${month}-${day}`
  ) {
    return null;
  }

  return {
    dateKey: `${year}-${month}-${day}`,
    url: url.href
  };
}

export function parseTixelDiscoveryPage(html: string): TixelDiscoveryPage {
  const $ = cheerio.load(html);
  const cards: TixelDiscoveryCard[] = [];
  const seenUrls = new Set<string>();

  $("[data-e2e$='/:event'] > a[href]").each((_, element) => {
    const anchor = $(element);
    const normalizedUrl = normalizeTixelEventUrl(anchor.attr("href") ?? "");
    const titleElement = anchor.find("strong").first();
    const title = normalizeWhitespace(titleElement.text());
    const venueName = normalizeWhitespace(
      titleElement.closest("p").next("p").first().text()
    );

    if (
      !normalizedUrl ||
      !title ||
      !venueName ||
      seenUrls.has(normalizedUrl.url)
    ) {
      return;
    }

    seenUrls.add(normalizedUrl.url);
    cards.push({
      dateKey: normalizedUrl.dateKey,
      title,
      url: normalizedUrl.url,
      venueName
    });
  });

  let maxPage = 1;

  $("a[href]").each((_, element) => {
    let url: URL;

    try {
      url = new URL($(element).attr("href") ?? "", TIXEL_DISCOVERY_URL);
    } catch {
      return;
    }

    if (
      url.hostname !== "tixel.com" ||
      url.pathname !== "/au/discover/Perth/music-tickets"
    ) {
      return;
    }

    const page = Number(url.searchParams.get("page"));

    if (Number.isInteger(page) && page > maxPage) {
      maxPage = page;
    }
  });

  return { cards, maxPage };
}

export function parseTixelEventDetail(
  html: string,
  expectedUrl: string
): TixelEventDetail | null {
  const normalizedExpectedUrl = normalizeTixelEventUrl(expectedUrl);

  if (!normalizedExpectedUrl) {
    return null;
  }

  const $ = cheerio.load(html);
  const nodes: Record<string, unknown>[] = [];

  $("script[type='application/ld+json']").each((_, element) => {
    try {
      nodes.push(...getJsonLdNodes(JSON.parse($(element).text())));
    } catch {
      // Ignore unrelated malformed JSON-LD blocks and require a valid MusicEvent below.
    }
  });

  for (const node of nodes) {
    if (!hasMusicEventType(node["@type"])) {
      continue;
    }

    const title =
      typeof node.name === "string" ? normalizeWhitespace(node.name) : "";
    const startsAt =
      typeof node.startDate === "string" ? node.startDate.trim() : "";
    const location =
      node.location && typeof node.location === "object"
        ? (node.location as Record<string, unknown>)
        : null;
    const venueName =
      typeof location?.name === "string"
        ? normalizeWhitespace(location.name)
        : "";
    const country = getAddressCountry(location?.address);
    const normalizedUrl =
      typeof node.url === "string" ? normalizeTixelEventUrl(node.url) : null;
    const dateKey = getPerthDateKey(startsAt);

    if (
      !title ||
      !venueName ||
      !normalizedUrl ||
      normalizedUrl.url !== normalizedExpectedUrl.url ||
      normalizedUrl.dateKey !== dateKey ||
      !country ||
      !["au", "australia"].includes(country.toLowerCase())
    ) {
      continue;
    }

    return {
      dateKey,
      startsAt: new Date(startsAt).toISOString(),
      title,
      url: normalizedUrl.url,
      venueName
    };
  }

  return null;
}
