import { createHash } from "node:crypto";

const NON_ALPHANUMERIC = /[^a-z0-9]+/g;
const APOSTROPHES = /['’]/g;

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

export function slugifyVenueName(value: string): string {
  return slugify(value.replace(APOSTROPHES, ""));
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
