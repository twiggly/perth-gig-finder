import { normalizeWhitespace } from "@perth-gig-finder/shared";

import {
  createArtistExtraction,
  unknownArtistExtraction
} from "../../artist-utils";

const TICKETEK_ARTIST_LIST_SEPARATOR_PATTERN = /\s*(?:,|\+|;)\s*/;
const TICKETEK_PRESENTS_PATTERN = /^(.+?)\s+presents?\s+(.+)$/i;
const TICKETEK_FEATURE_PATTERN = /\b(?:featuring|feat\.?|ft\.?)\s+(.+)$/i;
const TICKETEK_ARTIST_LABEL_PREFIX_PATTERN = /^(?:featuring|feat\.?|ft\.?)\s+/i;
const TICKETEK_ARTIST_TRAILING_NOISE_PATTERN =
  /\s+(?:and more!?|plus more!?|more to be announced|tba|tbc)$/i;
const TICKETEK_GENERIC_PROMOTER_PATTERN =
  /^(?:live nation|ticketek|frontier touring|destroy all lines|secret sounds|triple j|presented by .+)$/i;

function normalizeTicketekArtistToken(value: string): string {
  return normalizeWhitespace(
    value
      .replace(TICKETEK_ARTIST_LABEL_PREFIX_PATTERN, "")
      .replace(TICKETEK_ARTIST_TRAILING_NOISE_PATTERN, "")
      .replace(/^[-–•]+|[-–•]+$/g, "")
  );
}

function isLikelyTicketekArtistName(value: string): boolean {
  if (!value || TICKETEK_GENERIC_PROMOTER_PATTERN.test(value)) {
    return false;
  }

  if (value.length > 80 || /[.?!]/.test(value) || /https?:\/\//i.test(value)) {
    return false;
  }

  const wordCount = value.split(/\s+/).filter(Boolean).length;

  return wordCount > 0 && wordCount <= 8;
}

function splitTicketekArtistList(value: string): string[] {
  const normalized = normalizeTicketekArtistToken(value).replace(
    /\s+\band\b\s+(?=[^,;+]+$)/i,
    ", "
  );

  if (!normalized) {
    return [];
  }

  return normalized
    .split(TICKETEK_ARTIST_LIST_SEPARATOR_PATTERN)
    .map((artist) => normalizeTicketekArtistToken(artist))
    .filter((artist) => isLikelyTicketekArtistName(artist));
}

export function extractTicketekArtistsFromText(input: {
  title: string;
  subtitle: string | null;
  summary: string | null;
}) {
  const title = normalizeWhitespace(input.title);
  const candidates: string[] = [];
  const presentsMatch = title.match(TICKETEK_PRESENTS_PATTERN);

  if (presentsMatch?.[1]) {
    candidates.push(...splitTicketekArtistList(presentsMatch[1]));
  }

  const featureValues = [title, input.subtitle, input.summary];

  for (const value of featureValues) {
    const featureMatch = normalizeWhitespace(value ?? "").match(TICKETEK_FEATURE_PATTERN);

    if (featureMatch?.[1]) {
      candidates.push(...splitTicketekArtistList(featureMatch[1]));
    }
  }

  return candidates.length > 0
    ? createArtistExtraction(candidates, "parsed_text")
    : unknownArtistExtraction();
}
