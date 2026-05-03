import { createHash } from "node:crypto";

const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const APOSTROPHES = /['’]/g;
const STATUS_PREFIX = /^(cancelled|postponed)\s*[-:]\s*/i;
const ORDINAL_SUFFIX = /\b(\d+)(st|nd|rd|th)\b/gi;
const CANONICAL_TITLE_NOISE_PATTERNS = [
  /\balbum launch\b/gi,
  /\bbirthday\b/gi,
  /\bin concert\b/gi,
  /\blive\b/gi,
  /\btour\b/gi,
  /\b20\d{2}\b/g
];
const CANONICAL_TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "the",
  "to",
  "with"
]);
const VENUE_NAME_OVERRIDES = new Map<string, string>([
  ["clancys-fish-pub-freemantle", "Clancy's Fish Pub"],
  ["clancys-fish-pub-fremantle", "Clancy's Fish Pub"],
  ["four5nine-bar", "Four5Nine Bar @ Rosemount"],
  ["hackett-hall-wa-museum-boola-bardip", "Hackett Hall, WA Museum Boola Bardip"],
  [
    "stan-perron-wa-treasures-hackett-hall-wa-museum-boola-bardip",
    "Hackett Hall, WA Museum Boola Bardip"
  ],
  ["music-on-murray-st", "Music on Murray St"],
  ["north-freo-bowlo-hilton-park-bowling-club", "North Freo Bowlo"],
  ["old-habits", "Old Habits Neighbourhood Bar"],
  ["seasonal-brewing-co", "The Seasonal Brewing Co"],
  ["the-court-hotel", "The Court"],
  ["the-seasonal-brewing-co", "The Seasonal Brewing Co"]
]);
const VENUE_WEBSITE_OVERRIDES = new Map<string, string>([
  ["the-court", "https://thecourt.com.au/"],
  ["the-seasonal-brewing-co", "https://www.seasonalbrewing.beer/"],
  ["four5nine-bar-rosemount", "https://www.rosemounthotel.com.au/"],
  ["rosemount-hotel", "https://www.rosemounthotel.com.au/"]
]);
const VENUE_SUBURB_OVERRIDES = new Map<string, string>([
  ["north-freo-bowlo", "North Fremantle"],
  ["the-bird", "Northbridge"],
  ["the-duke-of-george", "East Fremantle"],
  ["the-rechabite", "Northbridge"]
]);
const VENUE_ADDRESS_OVERRIDES = new Map<string, string>([
  ["north-freo-bowlo", "8 Thompson Road, North Fremantle WA 6159"],
  ["the-court", "50 Beaufort Street, Perth WA 6000"],
  ["the-duke-of-george", "135 Duke St, East Fremantle WA 6158"]
]);
const HTML_ENTITIES = new Map<string, string>([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["nbsp", " "],
  ["quot", "\""]
]);

function decodeHtmlEntity(entity: string): string {
  const normalizedEntity = entity.toLowerCase();

  if (normalizedEntity.startsWith("#x")) {
    const codePoint = Number.parseInt(normalizedEntity.slice(2), 16);
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : `&${entity};`;
  }

  if (normalizedEntity.startsWith("#")) {
    const codePoint = Number.parseInt(normalizedEntity.slice(1), 10);
    return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : `&${entity};`;
  }

  return HTML_ENTITIES.get(normalizedEntity) ?? `&${entity};`;
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (_, entity: string) =>
    decodeHtmlEntity(entity)
  );
}

export function normalizeWhitespace(value: string): string {
  return decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
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

export function normalizeCanonicalTitleForMatch(value: string): string {
  let normalized = normalizeWhitespace(value)
    .replace(STATUS_PREFIX, "")
    .replace(ORDINAL_SUFFIX, "$1");

  for (const pattern of CANONICAL_TITLE_NOISE_PATTERNS) {
    normalized = normalized.replace(pattern, " ");
  }

  return slugify(normalized);
}

export function areCanonicalTitlesCompatible(left: string, right: string): boolean {
  const normalizedLeft = normalizeCanonicalTitleForMatch(left);
  const normalizedRight = normalizeCanonicalTitleForMatch(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const leftTokens = normalizedLeft.split("-").filter(Boolean);
  const rightTokens = normalizedRight.split("-").filter(Boolean);
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let overlap = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      overlap += 1;
    }
  }

  if (overlap === leftSet.size && overlap === rightSet.size && overlap >= 2) {
    return true;
  }

  const significantLeft = new Set(
    leftTokens.filter((token) => !CANONICAL_TITLE_STOP_WORDS.has(token))
  );
  const significantRight = new Set(
    rightTokens.filter((token) => !CANONICAL_TITLE_STOP_WORDS.has(token))
  );
  let significantOverlap = 0;

  for (const token of significantLeft) {
    if (significantRight.has(token)) {
      significantOverlap += 1;
    }
  }

  const smallerSize = Math.min(significantLeft.size, significantRight.size);
  const largerSize = Math.max(significantLeft.size, significantRight.size);

  return (
    significantOverlap === smallerSize &&
    significantOverlap >= 3 &&
    largerSize - smallerSize <= 2
  );
}

export function normalizeVenueName(value: string): string {
  const normalized = normalizeWhitespace(value);
  const lookupKey = slugify(normalized.replace(APOSTROPHES, ""));

  return VENUE_NAME_OVERRIDES.get(lookupKey) ?? normalized;
}

export function slugifyVenueName(value: string): string {
  return slugify(normalizeVenueName(value).replace(APOSTROPHES, ""));
}

export function normalizeVenueSuburb(
  venueName: string,
  suburb: string | null | undefined
): string | null {
  return (
    VENUE_SUBURB_OVERRIDES.get(slugifyVenueName(venueName)) ??
    (normalizeWhitespace(suburb ?? "") || null)
  );
}

export function normalizeVenueAddress(
  venueName: string,
  address: string | null | undefined
): string | null {
  return (
    VENUE_ADDRESS_OVERRIDES.get(slugifyVenueName(venueName)) ??
    (normalizeWhitespace(address ?? "") || null)
  );
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
