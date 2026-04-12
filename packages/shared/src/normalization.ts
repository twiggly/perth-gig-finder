import { createHash } from "node:crypto";

const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const APOSTROPHES = /['’]/g;
const VENUE_NAME_OVERRIDES = new Map<string, string>([
  ["clancys-fish-pub-freemantle", "Clancy's Fish Pub"],
  ["clancys-fish-pub-fremantle", "Clancy's Fish Pub"],
  ["four5nine-bar", "Four5Nine Bar @ Rosemount"]
]);
const VENUE_WEBSITE_OVERRIDES = new Map<string, string>([
  ["four5nine-bar-rosemount", "https://www.rosemounthotel.com.au/"],
  ["rosemount-hotel", "https://www.rosemounthotel.com.au/"]
]);

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function slugify(value: string): string {
  const normalized = normalizeWhitespace(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(NON_ALPHANUMERIC, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "item";
}

export function normalizeTitleForMatch(value: string): string {
  return slugify(value);
}

export function normalizeVenueName(value: string): string {
  const normalized = normalizeWhitespace(value);
  const lookupKey = slugify(normalized.replace(APOSTROPHES, ""));

  return VENUE_NAME_OVERRIDES.get(lookupKey) ?? normalized;
}

export function slugifyVenueName(value: string): string {
  return slugify(normalizeVenueName(value).replace(APOSTROPHES, ""));
}

export function normalizeVenueWebsiteUrl(
  venueName: string,
  websiteUrl: string | null
): string | null {
  if (websiteUrl) {
    return normalizeWhitespace(websiteUrl);
  }

  return VENUE_WEBSITE_OVERRIDES.get(slugifyVenueName(venueName)) ?? null;
}

export function buildGigSlug(input: {
  venueSlug: string;
  startsAt: string;
  title: string;
}): string {
  const datePart = input.startsAt.slice(0, 10);
  return slugify(`${input.venueSlug}-${datePart}-${input.title}`);
}

export function buildGigChecksum(input: {
  sourceSlug: string;
  startsAt: string;
  title: string;
  venueSlug: string;
  sourceUrl: string;
}): string {
  const payload = JSON.stringify({
    sourceSlug: input.sourceSlug,
    startsAt: input.startsAt,
    title: normalizeTitleForMatch(input.title),
    venueSlug: input.venueSlug,
    sourceUrl: input.sourceUrl
  });

  return createHash("sha256").update(payload).digest("hex");
}
