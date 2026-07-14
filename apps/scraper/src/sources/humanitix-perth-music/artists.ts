import { normalizeWhitespace, slugify } from "@perth-gig-finder/shared";

import {
  createArtistExtraction,
  hasKnownArtists,
  unknownArtistExtraction
} from "../../artist-utils";
import type { HumanitixPageMeta, HumanitixStructuredEvent } from "./types";

const HUMANITIX_ARTIST_LIST_SEPARATOR_PATTERN = /\s*(?:,|•|\+|;)\s*/;
const HUMANITIX_TITLE_PLUS_PATTERN = /^(.+?)\s+\+\s+(.+)$/;
const HUMANITIX_TITLE_LAUNCH_PATTERN = /^(.+?)\s+(?:single|ep|album)\s+launch\b/i;
const HUMANITIX_TITLE_SUPPORT_PATTERN =
  /^(.+?)\s+(?:with|w\/)\s+support\s+from\s+(.+)$/i;
const HUMANITIX_TITLE_WITH_LINEUP_PATTERN = /\bw[/.]\s+(.+)$/i;
const HUMANITIX_TITLE_SESSION_ARTIST_PATTERN =
  /\b(?:session|showcase):\s*(.+)$/i;
const HUMANITIX_EXPLICIT_ARTIST_PATTERNS = [
  /^special guests?\s*[:\-]\s*(.+)$/i,
  /\b(?:featuring|feat\.?|ft\.?)\s+(.+?)(?:\s+\/\/|[.!?]|$)/i,
  /\bwith support from\s+(.+?)(?:\s+\/\/|[.!?]|$)/i,
  /\bsupport from\s+(.+?)(?:\s+\/\/|[.!?]|$)/i,
  /\bsupported by\s+(.+?)(?:\s+\/\/|[.!?]|$)/i,
  /\bheadlined by\s+(.+?)(?:\s+\/\/|[.!?]|$)/i,
  /\bbringing together\s+(.+?)\s+in\s+(?:a|an)\s+(?:celebration|concert|performance)\b/i,
  /^lineup\s*[:\-]\s*(.+)$/i,
  /^artists?\s*[:\-]\s*(.+)$/i
];
const HUMANITIX_ARTIST_LABEL_PREFIX_PATTERN =
  /^(?:special guests?|featuring|feat\.?|ft\.?|with support from|support from|supported by|lineup|artists?)\s*[:\-]?\s*/i;
const HUMANITIX_ARTIST_TRAILING_NOISE_PATTERN =
  /\s+(?:and more!?|plus more!?|more to be announced|tba|tbc)$|\s*[-–—]\s*full\s+band$/i;
const HUMANITIX_SONG_CREDIT_CONTEXT_PATTERN =
  /\b(?:catalogue|catalog)\b.{0,140}$|\b(?:hits?|songs?|singles?|tracks?)\b.{0,90}\bincluding\b|\b(?:hit|song|single|track)\b.{0,100}$|\b(?:stream|listen\s+to)\b.{0,100}$/i;
const HUMANITIX_GENERIC_ARTIST_WORDS = new Set([
  "plus",
  "band",
  "bands",
  "music",
  "live",
  "alternative",
  "keywords",
  "lineup",
  "artists",
  "description",
  "event",
  "events",
  "performance",
  "play",
  "shows",
  "sound",
  "style",
  "tickets",
  "venue"
]);

function splitArtistNames(value: string): string[] {
  const normalized = value.trim();

  if (!normalized) {
    return [];
  }

  const looksLikeSentenceText =
    /[.?!]/.test(normalized) || /\b(is|are|from|with|presents)\b/i.test(normalized);
  const splitter = looksLikeSentenceText ? /[\n•]+/ : /[\n,•]+/;

  return normalized
    .split(splitter)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
}

function normalizeHumanitixArtistToken(value: string): string {
  return normalizeWhitespace(
    value
      .replace(HUMANITIX_ARTIST_LABEL_PREFIX_PATTERN, "")
      .replace(/^(?:and|&)\s+/i, "")
      .replace(/\s*\/\/\s*[^,;+•]+$/u, "")
      .replace(HUMANITIX_ARTIST_TRAILING_NOISE_PATTERN, "")
      .replace(/^[-–•]+|[-–•]+$/g, "")
  );
}

function splitHumanitixArtistLine(value: string): string[] {
  const normalizedToken = normalizeHumanitixArtistToken(value);
  const normalized = /[,;•+]/.test(normalizedToken)
    ? normalizedToken.replace(/\s+\band\b\s+(?=[^,;•+]+$)/i, ", ")
    : normalizedToken;

  if (!normalized) {
    return [];
  }

  return normalized
    .split(HUMANITIX_ARTIST_LIST_SEPARATOR_PATTERN)
    .map((entry) => normalizeHumanitixArtistToken(entry))
    .filter((entry) => isLikelyArtistName(entry));
}

function isHumanitixSongCreditArtistMatch(value: string, matchIndex: number): boolean {
  const contextBeforeMatch = value.slice(Math.max(0, matchIndex - 140), matchIndex);

  return HUMANITIX_SONG_CREDIT_CONTEXT_PATTERN.test(contextBeforeMatch);
}

function isLikelyArtistName(value: string): boolean {
  if (!value) {
    return false;
  }

  const normalized = normalizeWhitespace(value);
  const normalizedLower = normalized.toLowerCase();

  if (HUMANITIX_GENERIC_ARTIST_WORDS.has(normalizedLower)) {
    return false;
  }

  if (/\b(?:ft|feat|featuring)$/i.test(normalized)) {
    return false;
  }

  if (normalized.length > 80) {
    return false;
  }

  if (/[.?!,]/.test(normalized) || /https?:\/\//i.test(normalized) || /@/.test(normalized)) {
    return false;
  }

  if (/\b(?:instagram|website|spotify|facebook|tiktok|ticket|tickets)\b/i.test(normalized)) {
    return false;
  }

  if (/^(?:at|she|he|they|it|who|whose|her|his|their|making|listen|tune|style|shows?|music\s+by|performed\s+by|carried\s+by|values\s+)\b/i.test(normalized)) {
    return false;
  }

  if (/\b(?:annual tribute festivals|music blends|gentle guitars|warm harmonies|vivid lyricism|songs explore|heartbreak|healing|popular choice|voice that|town of|city of|wine|coffee|dinner service|bakery|wearables|puzzles|lunch|culture ireland|small projects|liquid architecture|audio foundation|frontrunner av|sponsor|soundwalk|pre-gathering|gathering|playlists|late night set|whimsy|spiralling|bar|community musicians|jazz and theatre settings)\b/i.test(normalized)) {
    return false;
  }

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  if (wordCount > 8) {
    return false;
  }

  return !/\b(is|are|from|with|and carried|writing|performs|presents?|present|hosts?|launch(?:ed|es)?|supported|building|offering|reflects|creating|co-creates|beyond the stage|crowned|journey|grounded|audiences|acclaimed|contemporary|orchestra presents|wide-ranging|repertoire|spanning|classical)\b/i.test(normalized);
}

function extractStructuredHumanitixArtists(structuredEvent: HumanitixStructuredEvent) {
  const candidates = [structuredEvent.performers, structuredEvent.performer].flatMap(
    (value) => (Array.isArray(value) ? value : value ? [value] : [])
  );
  const artists: string[] = [];

  for (const performer of candidates) {
    const rawPerformerName = normalizeWhitespace(performer.name ?? "");
    const performerName = normalizeHumanitixArtistToken(rawPerformerName);
    const namesAreInDescription = /\bincluding:?\s*$/i.test(rawPerformerName);

    if (performerName && !namesAreInDescription && isLikelyArtistName(performerName)) {
      artists.push(performerName);
    }

    if (!namesAreInDescription) {
      continue;
    }

    for (const name of splitArtistNames(performer.description ?? "")) {
      if (isLikelyArtistName(name)) {
        artists.push(name);
      }
    }
  }

  return createArtistExtraction(artists, "structured");
}

function parseHumanitixTitleArtists(title: string): string[] {
  const normalized = normalizeWhitespace(title);

  if (!normalized) {
    return [];
  }

  const candidates: string[] = [];
  const plusMatch = normalized.match(HUMANITIX_TITLE_PLUS_PATTERN);

  if (plusMatch) {
    candidates.push(...splitHumanitixArtistLine(`${plusMatch[1]}, ${plusMatch[2]}`));
  }

  const launchMatch = normalized.match(HUMANITIX_TITLE_LAUNCH_PATTERN);

  if (launchMatch) {
    const launchArtist = normalizeHumanitixArtistToken(launchMatch[1]);

    if (isLikelyArtistName(launchArtist)) {
      candidates.push(launchArtist);
    }
  }

  const supportMatch = normalized.match(HUMANITIX_TITLE_SUPPORT_PATTERN);

  if (supportMatch) {
    candidates.push(
      ...splitHumanitixArtistLine(supportMatch[1]),
      ...splitHumanitixArtistLine(supportMatch[2])
    );
  }

  const withLineupMatch = normalized.match(HUMANITIX_TITLE_WITH_LINEUP_PATTERN);

  if (withLineupMatch?.[1]) {
    candidates.push(
      ...splitHumanitixArtistLine(
        withLineupMatch[1]
          .replace(/\s+@\s+.+$/i, "")
          .replace(/\s+&\s+more\b.*$/i, "")
      )
    );
  }

  const sessionArtistMatch = normalized.match(HUMANITIX_TITLE_SESSION_ARTIST_PATTERN);

  if (sessionArtistMatch?.[1]) {
    const sessionArtist = normalizeHumanitixArtistToken(sessionArtistMatch[1]);

    if (isLikelyArtistName(sessionArtist)) {
      candidates.push(sessionArtist);
    }
  }

  candidates.push(...parseHumanitixExplicitTextArtists([normalized]));

  return candidates;
}

function parseHumanitixLineupArtists(lineupText: string[]): string[] {
  const candidates: string[] = [];
  let sawExplicitLineupSignal = false;

  for (const line of lineupText) {
    const normalizedLine = normalizeWhitespace(line);

    if (!normalizedLine) {
      continue;
    }

    const hasExplicitLabel = HUMANITIX_ARTIST_LABEL_PREFIX_PATTERN.test(normalizedLine);

    if (hasExplicitLabel) {
      sawExplicitLineupSignal = true;
      candidates.push(...splitHumanitixArtistLine(normalizedLine));
      continue;
    }

    if (/[:,;+]/.test(normalizedLine)) {
      const parsedArtists = splitHumanitixArtistLine(normalizedLine);

      if (parsedArtists.length >= 2) {
        sawExplicitLineupSignal = true;
        candidates.push(...parsedArtists);
      }

      continue;
    }

    if (isLikelyArtistName(normalizedLine)) {
      candidates.push(normalizedLine);
    }
  }

  const normalizedCandidates = createArtistExtraction(candidates, "parsed_text").artists;

  if (normalizedCandidates.length === 0) {
    return [];
  }

  return sawExplicitLineupSignal || normalizedCandidates.length >= 2
    ? normalizedCandidates
    : [];
}

function parseHumanitixExplicitTextArtists(
  values: Array<string | null | undefined>
): string[] {
  const candidates: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value ?? "");

    if (!normalized) {
      continue;
    }

    for (const pattern of HUMANITIX_EXPLICIT_ARTIST_PATTERNS) {
      const match = normalized.match(pattern);

      if (match?.[1]) {
        if (isHumanitixSongCreditArtistMatch(normalized, match.index ?? 0)) {
          continue;
        }

        const worldPremiereMatch = match[1].match(
          /^(?:world\s+)?premieres?\s+by\s+(.+)$/i
        );

        if (worldPremiereMatch?.[1]) {
          candidates.push(
            ...worldPremiereMatch[1]
              .split(/\s+(?:and|&)\s+/i)
              .flatMap(splitHumanitixArtistLine)
          );
        } else {
          candidates.push(...splitHumanitixArtistLine(match[1]));
        }
      }
    }
  }

  return candidates;
}

function mergeHumanitixArtistCandidates(
  primaryArtists: string[],
  explicitTextArtists: string[]
): string[] {
  const explicitDisplayBySlug = new Map(
    explicitTextArtists.map((artist) => [slugify(artist), artist] as const)
  );
  const primarySlugs = new Set(primaryArtists.map(slugify));

  return [
    ...primaryArtists.map((artist) => explicitDisplayBySlug.get(slugify(artist)) ?? artist),
    ...explicitTextArtists.filter((artist) => !primarySlugs.has(slugify(artist)))
  ];
}

function isCompositeOfKnownHumanitixArtists(
  artist: string,
  knownArtists: string[]
): boolean {
  const knownSlugs = new Set(knownArtists.map(slugify));
  const parts = artist
    .split(/\s+(?:and|&)\s+/i)
    .map((part) => normalizeWhitespace(part.replace(/\s*\([^)]*\)\s*$/g, "")))
    .filter(Boolean);

  return parts.length > 1 && parts.every((part) => knownSlugs.has(slugify(part)));
}

export function extractHumanitixArtists(input: {
  structuredEvent: HumanitixStructuredEvent;
  title: string;
  description: string | null;
  meta: Pick<HumanitixPageMeta, "pageText" | "headings" | "lineupText">;
}) {
  const structuredExtraction = extractStructuredHumanitixArtists(input.structuredEvent);
  const primaryParsedArtists = [
    ...parseHumanitixTitleArtists(input.title),
    ...parseHumanitixLineupArtists(input.meta.lineupText)
  ];
  const explicitTextArtists = parseHumanitixExplicitTextArtists([
    input.description,
    ...input.meta.pageText
  ]);
  const parsedArtists = mergeHumanitixArtistCandidates(
    primaryParsedArtists,
    explicitTextArtists
  ).filter(
    (artist) =>
      !isCompositeOfKnownHumanitixArtists(artist, structuredExtraction.artists)
  );

  if (hasKnownArtists(structuredExtraction)) {
    return createArtistExtraction(
      [...structuredExtraction.artists, ...parsedArtists],
      "structured"
    );
  }

  return parsedArtists.length > 0
    ? createArtistExtraction(parsedArtists, "parsed_text")
    : unknownArtistExtraction();
}
