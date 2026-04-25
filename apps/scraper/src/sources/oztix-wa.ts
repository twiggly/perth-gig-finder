import * as cheerio from "cheerio";

import {
  buildGigChecksum,
  normalizeVenueName,
  normalizeVenueWebsiteUrl,
  normalizeWhitespace,
  slugifyVenueName,
  type GigStatus,
  type JsonObject,
  type NormalizedGig,
  type NormalizedVenue
} from "@perth-gig-finder/shared";

import { createArtistExtraction } from "../artist-utils";
import { queryAlgolia } from "../algolia";
import type { SourceAdapter, SourceAdapterResult } from "../types";

const SOURCE_URL = "https://www.oztix.com.au/search?states%5B0%5D=WA&q=";
const OZTIX_APP_ID = "ICGFYQWGTD";
const OZTIX_API_KEY = "bc11adffff267d354ad0a04aedebb5b5";
const OZTIX_INDEX_NAME = "prod_oztix_eventguide";
const PERTH_CBD = {
  lat: -31.9523,
  lng: 115.8613
};
const PERTH_METRO_RADIUS_KM = 32;

const MUSIC_CATEGORY_KEYWORDS = [
  "music",
  "pop",
  "dance",
  "electronic",
  "hip hop",
  "house",
  "tech house",
  "techno",
  "indie",
  "alternative",
  "rock",
  "metal",
  "punk",
  "hardcore",
  "emo",
  "folk",
  "country",
  "blues",
  "jazz",
  "soul",
  "funk",
  "disco",
  "reggae",
  "dj"
];

const NON_MUSIC_CATEGORY_KEYWORDS = [
  "comedy",
  "theatre",
  "theater",
  "arts",
  "attractions",
  "cabaret",
  "burlesque",
  "class",
  "classes",
  "membership",
  "memberships",
  "sports",
  "sport",
  "podcast"
];

const EXPLICIT_NON_GIG_TEXT_PATTERNS = [
  /\bclass(?:es)?\b/i,
  /\bworkshop(?:s)?\b/i,
  /\bmasterclass(?:es)?\b/i,
  /\bintroduction to\b/i,
  /\bhands-on\b/i,
  /\bpanelists?\b/i,
  /\bprofessional development\b/i,
  /\bcheesemaking\b/i,
  /\bmaterials?\s+(?:and|&)\s+ingredients\s+provided\b/i,
  /\btake home everything you make\b/i
];

const EXPLICIT_MUSIC_TEXT_PATTERNS = [
  /\bdj(?:s)?\b/i,
  /\bband(?:s)?\b/i,
  /\btribute\b/i,
  /\bconcert\b/i,
  /\btour\b/i,
  /\bfestival\b/i,
  /\brave\b/i,
  /\blaunch\b/i,
  /\borchestra\b/i,
  /\bchoir\b/i,
  /\bsongbook\b/i,
  /\balbum\b/i,
  /\brock\b/i,
  /\bmetal\b/i,
  /\bpunk\b/i,
  /\bjazz\b/i,
  /\bhip hop\b/i,
  /\bhouse\b/i,
  /\btechno\b/i,
  /\bemo\b/i,
  /\bindie\b/i,
  /\bfolk\b/i,
  /\bblues\b/i,
  /\bcountry\b/i,
  /\bpop\b/i
];

const SPECIAL_GUEST_PREFIX_PATTERN =
  /^(?:with|plus)?\s*special guests?[:,]?\s*|^(?:with|plus)\s+guests?[:,]?\s*|^w[/.]\s*|^(?:with|plus)\s+|^starring\s+|^featuring\s+|^feat\.?\s+|^ft\.?\s+/i;
const GENERIC_SPECIAL_GUEST_PATTERN =
  /^(?:(?:a|an)\s+)?(?:special\s+)?guests?\s*(?:to be announced|tba|tbc)?$|^(?:(?:local|more|additional|special)\s+)*(?:support|supports|support acts?)\s*(?:to be announced|tba|tbc)?$|^(?:secret|mystery)\s+(?:act|artist|guest|set)s?[!.]?$|^(?:more|more\s+(?:acts?|artists?|guests?))[!.]?$|^(?:tba|tbc|to be announced|more\s+(?:tba|tbc|to be announced)|more to be announced)$|^(?:past|present(?:\s+members?)?)$/i;
const SPECIAL_GUEST_SEPARATOR_PATTERN = /\s*(?:,|\+|\^|\||[•·]|\s-\s)\s*/u;
const SPECIAL_GUEST_TOUR_LEAD_IN_PATTERN =
  /^.+?\b(?:tour|single|album|ep|launch|show)\b\s+with\s+special guests?[:,]?\s+/i;
const TITLE_FEATURED_ARTIST_PATTERN =
  /\b(?:ft\.?|feat\.?|featuring)\s+(.+)$/i;
const TITLE_PRESENTED_ARTIST_PATTERN =
  /^.{1,80}?\bpresents:\s+(.+)$/i;
const TITLE_QUOTED_TOUR_HEADLINER_PATTERN =
  /^(.+?)\s+(?:"[^"]+"|'[^']+'|“[^”]+”|‘[^’]+’)$/;
const TITLE_TRIBUTE_SUBJECT_PATTERN =
  /^(.+?)\s+the\s+australian\s+tribute\b/i;
const TITLE_TRIBUTE_TO_SUBJECT_PATTERN =
  /\b(?:a\s+)?tribute\s+to\s+(.+?)(?:\s+(?:ft\.?|feat\.?|featuring|with)\b|$)/i;
const TITLE_SLASH_TRIBUTE_SUBJECT_PATTERN =
  /^(.+?)\s+tribute(?:\s+(?:night|show))?\b/i;
const TITLE_HEADLINER_SEPARATOR_PATTERN = /\s[-–—:]\s|[,+]/;
const OZTIX_BROKEN_EMOJI_QUESTION_RUN_PATTERN = /\?{3,}/g;
const OZTIX_NOISY_ARTIST_FRAGMENT_PATTERN =
  /^(?:djs?\s+playing\s+the\s+best\s+of\b.*|support\s+set\s+of\b.*|the\s+greatest\s+emo|metalcore|alternative\s+tracks\s+of\s+all\s+time\b.*|hlh\/dod\s+after\s+party!?|friday\s+fright\s+night|past|present(?:\s+members?)?)$/i;
const OZTIX_GENERIC_ARTIST_TOKEN_PATTERN =
  /^(?:dj|band|live\s+abba\s+tribute\s+act|.+\btribute\s+set)$/i;
const OZTIX_TITLE_LINEUP_NOISE_PATTERN =
  /\b(?:party|night|brunch|rave|session|sessions|tribute|show|festival|all-?dayer|experience|appreciation|karaoke|worship|launch|single|album|tour|tickets?|pres\.?|presented|presents?|vs)\b/i;
const ARTIST_LOCATION_SUFFIX_PATTERN =
  /\s*\((?:wa|nsw|vic|qld|sa|tas|nt|act|australia|aus|nz|usa|uk|eng|swe|ger|deu|jpn|can|ire|irl|sco|fra|ita|esp|nl|nld)\)\s*$/gi;
const OZTIX_ARTIST_DESCRIPTOR_PARENTHESES_PATTERN =
  /\s*\((?:solo|performing|tribute|acoustic|dj\s*set|support)\b[^)]*\)\s*/gi;
const OZTIX_ARTIST_MUSIC_OF_SUFFIX_PATTERN =
  /\s+(?:&|and)\s+the\s+music\s+of\b.*$/i;
const LEETSPEAK_ARTIST_CHARACTERS: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t"
};

export interface OztixVenue {
  Name?: string;
  Address?: string;
  Locality?: string;
  State?: string;
  WebsiteUrl?: string;
  Timezone?: string;
}

export interface OztixPerformance {
  Name?: string;
}

export interface OztixHit {
  EventGuid?: string;
  EventName?: string;
  SpecialGuests?: string;
  EventDescription?: string;
  HomepageImage?: string | null;
  EventImage1?: string | null;
  DateStart?: string;
  DateEnd?: string | null;
  EventUrl?: string;
  Categories?: string[];
  _geoloc?: {
    lat?: number;
    lng?: number;
  } | null;
  Venue?: OztixVenue;
  Bands?: string[];
  Performances?: OztixPerformance[];
  TourName?: string | null;
  IsCancelled?: boolean;
  IsPostponed?: boolean;
  IsRescheduled?: boolean;
  AffectedBy?: string | null;
  HasEventDatePassed?: boolean;
}

interface AlgoliaResponse {
  results: Array<{
    hits: OztixHit[];
  }>;
}

function isFiniteCoordinate(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(
  start: { lat: number; lng: number },
  end: { lat: number; lng: number }
): number {
  const earthRadiusKm = 6371;
  const deltaLat = toRadians(end.lat - start.lat);
  const deltaLng = toRadians(end.lng - start.lng);
  const startLat = toRadians(start.lat);
  const endLat = toRadians(end.lat);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

function toPlainText(html: string | null | undefined): string | null {
  if (!html) {
    return null;
  }

  const text = cheerio.load(`<div>${html}</div>`).text();
  const normalized = normalizeWhitespace(text);
  return normalized.length > 0 ? normalized : null;
}

function normalizeUtcDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const withTimezone =
    value.endsWith("Z") || value.includes("+") ? value : `${value}Z`;
  const date = new Date(withTimezone);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid event date: ${value}`);
  }

  return date.toISOString();
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

function stripImageSizeParams(urlValue: string): string {
  try {
    const url = new URL(urlValue);
    url.searchParams.delete("width");
    url.searchParams.delete("height");
    return url.toString();
  } catch {
    return urlValue;
  }
}

function parseImageArea(urlValue: string): number | null {
  try {
    const url = new URL(urlValue);
    const width = Number(url.searchParams.get("width") ?? "");
    const height = Number(url.searchParams.get("height") ?? "");

    if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
      return width * height;
    }
  } catch {
    // Ignore malformed URLs and fall back to the candidate ordering.
  }

  return null;
}

export function selectPreferredImageUrl(hit: OztixHit): string | null {
  const candidates = [hit.EventImage1, hit.HomepageImage]
    .map((value) => normalizeUrl(value))
    .filter((value): value is string => Boolean(value))
    .map((value) => ({
      area: parseImageArea(value),
      preferred: stripImageSizeParams(value)
    }));

  if (candidates.length === 0) {
    return null;
  }

  const [preferred] = candidates.sort((left, right) => {
    const leftArea = left.area;
    const rightArea = right.area;

    if (leftArea !== null && rightArea !== null && leftArea !== rightArea) {
      return rightArea - leftArea;
    }

    if (leftArea !== null) {
      return -1;
    }

    if (rightArea !== null) {
      return 1;
    }

    return 0;
  });

  return preferred.preferred;
}

export function normalizeOztixTitle(value: string | null | undefined): string {
  return normalizeWhitespace(value ?? "")
    .replace(/^\?{3,}\s*/g, "")
    .replace(/\s*\?{3,}(?=\s|$)/g, "")
    .replace(OZTIX_BROKEN_EMOJI_QUESTION_RUN_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectNamedArtists(hit: OztixHit): string[] {
  const fromBands = Array.isArray(hit.Bands) ? hit.Bands : [];
  const fromPerformances = Array.isArray(hit.Performances)
    ? hit.Performances.map((performance) => performance.Name ?? "")
    : [];
  const fromTourName = hit.TourName ? [hit.TourName] : [];
  const fromSpecialGuests = parseOztixSpecialGuests(hit.SpecialGuests);
  const fromTitleFeatured = parseOztixTitleFeaturedArtists(hit.EventName);
  const fromTitlePresented = parseOztixTitlePresentedArtists(hit.EventName);
  const fromTitleHeadliner =
    fromBands.length === 0 && fromPerformances.length === 0
      ? parseOztixTitleHeadlinerArtists(hit.EventName)
      : [];

  return [
    ...[...fromBands, ...fromPerformances, ...fromTourName].flatMap(splitOztixStructuredArtist),
    ...fromTitleHeadliner,
    ...fromTitlePresented,
    ...fromSpecialGuests,
    ...fromTitleFeatured
  ]
    .map((artist) => normalizeWhitespace(artist))
    .filter(Boolean);
}

function collectStructuredArtists(hit: OztixHit): string[] {
  const fromBands = Array.isArray(hit.Bands) ? hit.Bands : [];
  const fromPerformances = Array.isArray(hit.Performances)
    ? hit.Performances.map((performance) => performance.Name ?? "")
    : [];

  return [...fromBands, ...fromPerformances]
    .flatMap(splitOztixStructuredArtist)
    .filter(Boolean);
}

function stripOztixArtistPrefix(value: string): string {
  let normalized = normalizeWhitespace(value);

  while (SPECIAL_GUEST_PREFIX_PATTERN.test(normalized)) {
    normalized = normalizeWhitespace(normalized.replace(SPECIAL_GUEST_PREFIX_PATTERN, ""));
  }

  return normalized;
}

function cleanOztixArtistToken(value: string): string {
  let normalized = stripOztixArtistPrefix(value)
    .replace(OZTIX_ARTIST_MUSIC_OF_SUFFIX_PATTERN, "")
    .replace(OZTIX_ARTIST_DESCRIPTOR_PARENTHESES_PATTERN, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  const performedByMatch = normalized.match(/^performed\s+by\s+(.+?)(?:\s*\/\s*.+)?$/i);

  if (performedByMatch?.[1]) {
    normalized = performedByMatch[1];
  }

  return normalizeWhitespace(normalized);
}

function normalizeSpecialGuestToken(value: string): string {
  return stripOztixArtistPrefix(
    value
      .replace(SPECIAL_GUEST_TOUR_LEAD_IN_PATTERN, "")
      .replace(/\s*(?:\.|;)\s*(?:with\s+)?supports?\s+from\s+/gi, ", ")
      .replace(/\b(?:with\s+)?supports?\s+from\s+/gi, ", ")
      .replace(
        /\s+-\s+(?:a\s+)?tribute\s+to\s+[^,&+|]+?\s+(?:&|and)\s+/gi,
        ", "
      )
      .replace(/\s+-\s+(?:a\s+)?tribute\s+to\s+[^,&+|]+$/gi, "")
  ).replace(/\s+and\s+/gi, ", ");
}

export function parseOztixSpecialGuests(value: string | null | undefined): string[] {
  const normalized = normalizeSpecialGuestToken(value ?? "").replace(
    /\)\s+(?=[A-Z0-9][A-Z0-9 "'&!./:-]{0,80}\([A-Z]{2,}\))/g,
    "), "
  );

  if (!normalized) {
    return [];
  }

  return createArtistExtraction(splitOztixArtistList(normalized), "parsed_text").artists;
}

function normalizeArtistIdentity(value: string): string {
  return normalizeWhitespace(value)
    .replace(ARTIST_LOCATION_SUFFIX_PATTERN, "")
    .toLowerCase()
    .replace(/[013457]/g, (character) => LEETSPEAK_ARTIST_CHARACTERS[character] ?? character)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isDuplicateOrCompositeOztixArtist(
  artist: string,
  knownArtists: string[]
): boolean {
  const knownArtistIdentities = new Set(
    knownArtists
      .map((knownArtist) => normalizeArtistIdentity(knownArtist))
      .filter(Boolean)
  );
  const artistIdentity = normalizeArtistIdentity(artist);

  if (!artistIdentity) {
    return true;
  }

  if (knownArtistIdentities.has(artistIdentity)) {
    return true;
  }

  const compositeParts = artist
    .split(/\s+(?:&|and)\s+/i)
    .map((part) => normalizeArtistIdentity(part))
    .filter(Boolean);

  return (
    compositeParts.length > 1 &&
    compositeParts.every((part) => knownArtistIdentities.has(part))
  );
}

function splitOztixArtistList(value: string): string[] {
  const normalized = value
    .replace(OZTIX_ARTIST_DESCRIPTOR_PARENTHESES_PATTERN, " ")
    .replace(/\s+plus\s+the\s+electric\s+energy\s+of\s+/gi, ", ")
    .replace(/\s+with\s+percussion\s+by\s+/gi, ", ")
    .replace(/\s+with\s+(?=[A-Z0-9])/gi, ", ")
    .replace(/\s+and\s+/gi, ", ");
  const hasExplicitListSeparator = /(?:,|\+|\^|\||[•·]|\s-\s)/u.test(
    normalized
  );

  return normalized
    .split(SPECIAL_GUEST_SEPARATOR_PATTERN)
    .flatMap((token) => token.split(/\s*,\s*/))
    .flatMap((token) =>
      splitOztixAmpersandArtistToken(token, hasExplicitListSeparator)
    )
    .map(cleanOztixArtistToken)
    .filter(Boolean)
    .filter(isLikelyOztixArtistName)
    .filter((token) => !GENERIC_SPECIAL_GUEST_PATTERN.test(token));
}

function splitOztixAmpersandArtistToken(
  value: string,
  hasExplicitListSeparator: boolean
): string[] {
  const normalized = normalizeWhitespace(value);

  if (!/\s&\s/.test(normalized)) {
    return [normalized];
  }

  const parts = normalized
    .split(/\s*&\s*/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  if (parts.length < 2) {
    return [normalized];
  }

  if (/^[A-Z0-9 '&./-]+$/.test(normalized)) {
    return parts;
  }

  const rightPart = parts[parts.length - 1] ?? "";

  if (/^the\s+/i.test(rightPart)) {
    return [normalized];
  }

  if (hasExplicitListSeparator) {
    return parts;
  }

  const leftPart = parts[0] ?? "";

  const hasStandaloneAcronymPart = parts.some((part) => /^[A-Z0-9]{2,}$/.test(part));

  if (hasStandaloneAcronymPart && parts.every((part) => /^[A-Z0-9]/.test(part))) {
    return parts;
  }

  return [normalized];
}

function splitOztixStructuredArtist(value: string | null | undefined): string[] {
  const normalized = normalizeWhitespace(value ?? "")
    .replace(/\s+plus\s+the\s+electric\s+energy\s+of\s+/i, ", ")
    .replace(/\s+with\s+percussion\s+by\s+/i, ", ");

  return splitOztixArtistList(normalized);
}

function isLikelyOztixArtistName(value: string): boolean {
  const normalized = normalizeWhitespace(value);

  if (!normalized || normalized.length > 90) {
    return false;
  }

  if (
    OZTIX_NOISY_ARTIST_FRAGMENT_PATTERN.test(normalized) ||
    OZTIX_GENERIC_ARTIST_TOKEN_PATTERN.test(normalized)
  ) {
    return false;
  }

  return !/\ball\.?\s+night\.?\s+long\b/i.test(normalized);
}

export function parseOztixTitleFeaturedArtists(
  title: string | null | undefined
): string[] {
  const normalized = normalizeOztixTitle(title);
  const match = normalized.match(TITLE_FEATURED_ARTIST_PATTERN);

  if (!match?.[1]) {
    return [];
  }

  return createArtistExtraction(splitOztixArtistList(match[1]), "parsed_text").artists;
}

export function parseOztixTitlePresentedArtists(
  title: string | null | undefined
): string[] {
  const normalized = normalizeOztixTitle(title);
  const match = normalized.match(TITLE_PRESENTED_ARTIST_PATTERN);

  if (!match?.[1]) {
    return [];
  }

  return createArtistExtraction(splitOztixArtistList(match[1]), "parsed_text").artists;
}

export function parseOztixTitleHeadlinerArtists(
  title: string | null | undefined
): string[] {
  const normalized = normalizeOztixTitle(title);
  const match = normalized.match(TITLE_QUOTED_TOUR_HEADLINER_PATTERN);

  if (!match?.[1]) {
    return [];
  }

  const headliner = normalizeWhitespace(match[1]);

  if (!headliner || TITLE_HEADLINER_SEPARATOR_PATTERN.test(headliner)) {
    return [];
  }

  return createArtistExtraction([headliner], "parsed_text").artists;
}

export function parseOztixTitleLineupArtists(
  title: string | null | undefined
): string[] {
  const normalized = normalizeOztixTitle(title);

  if (
    !normalized ||
    normalized.length > 120 ||
    !normalized.includes(",") ||
    OZTIX_TITLE_LINEUP_NOISE_PATTERN.test(normalized)
  ) {
    return [];
  }

  const artists = splitOztixArtistList(normalized);

  return artists.length >= 2
    ? createArtistExtraction(artists, "parsed_text").artists
    : [];
}

function getOztixTributeSubject(title: string | null | undefined): string | null {
  const normalized = normalizeOztixTitle(title);
  const match = normalized.match(TITLE_TRIBUTE_SUBJECT_PATTERN);

  return match?.[1] ? normalizeWhitespace(match[1]) : null;
}

function getOztixTributeSubjects(title: string | null | undefined): string[] {
  const subjects = [];
  const australianTributeSubject = getOztixTributeSubject(title);

  if (australianTributeSubject) {
    subjects.push(australianTributeSubject);
  }

  const normalized = normalizeOztixTitle(title);
  const tributeToMatch = normalized.match(TITLE_TRIBUTE_TO_SUBJECT_PATTERN);

  if (tributeToMatch?.[1]) {
    subjects.push(
      ...tributeToMatch[1]
        .split(/\s*(?:\/|,|\+|&|\band\b)\s*/i)
        .map((subject) => normalizeWhitespace(subject))
        .filter(Boolean)
    );
  }

  const slashTributeMatch = normalized.match(TITLE_SLASH_TRIBUTE_SUBJECT_PATTERN);

  if (slashTributeMatch?.[1] && slashTributeMatch[1].includes("/")) {
    subjects.push(
      ...slashTributeMatch[1]
        .split(/\s*\/\s*/)
        .map((subject) => normalizeWhitespace(subject))
        .filter(Boolean)
    );
  }

  return subjects;
}

function dedupeOztixArtistsByIdentity(artists: string[]): string[] {
  const seenIdentities = new Set<string>();
  const dedupedArtists = [];

  for (const artist of artists) {
    const identity = normalizeArtistIdentity(artist);

    if (!identity || seenIdentities.has(identity)) {
      continue;
    }

    seenIdentities.add(identity);
    dedupedArtists.push(artist);
  }

  return dedupedArtists;
}

function isOztixThemePartyTitle(title: string | null | undefined): boolean {
  const normalized = normalizeOztixTitle(title);

  return /\bparty\b/i.test(normalized) && /\b(?:vs|playing the best of|worship|after party)\b/i.test(normalized);
}

function isOztixThemePartySubject(title: string | null | undefined, artist: string): boolean {
  if (!isOztixThemePartyTitle(title)) {
    return false;
  }

  const titleIdentity = normalizeArtistIdentity(normalizeOztixTitle(title));
  const artistIdentity = normalizeArtistIdentity(artist);

  return Boolean(artistIdentity && titleIdentity.includes(artistIdentity));
}

function normalizeCategories(hit: OztixHit): string[] {
  return (Array.isArray(hit.Categories) ? hit.Categories : [])
    .map((category) => normalizeWhitespace(category).toLowerCase())
    .filter(Boolean);
}

function hasExplicitNonGigSignal(hit: OztixHit): boolean {
  const title = normalizeWhitespace(hit.EventName ?? "");
  const description = toPlainText(hit.EventDescription);
  const haystacks = [title, description].filter((value): value is string => Boolean(value));

  return haystacks.some((value) =>
    EXPLICIT_NON_GIG_TEXT_PATTERNS.some((pattern) => pattern.test(value))
  );
}

function hasExplicitMusicSignal(hit: OztixHit): boolean {
  const title = normalizeWhitespace(hit.EventName ?? "");
  const description = toPlainText(hit.EventDescription);
  const haystacks = [title, description].filter((value): value is string => Boolean(value));

  return haystacks.some((value) =>
    EXPLICIT_MUSIC_TEXT_PATTERNS.some((pattern) => pattern.test(value))
  );
}

export function extractOztixArtists(hit: OztixHit) {
  const titleFeaturedArtists = parseOztixTitleFeaturedArtists(hit.EventName);
  const titlePresentedArtists = parseOztixTitlePresentedArtists(hit.EventName);
  const tributeSubjectIdentities = new Set(
    getOztixTributeSubjects(hit.EventName).map(normalizeArtistIdentity)
  );
  const structuredArtists = [
    ...(Array.isArray(hit.Bands) ? hit.Bands : []).flatMap(splitOztixStructuredArtist),
    ...(Array.isArray(hit.Performances)
      ? hit.Performances.flatMap((performance) =>
          splitOztixStructuredArtist(performance.Name ?? "")
        )
      : []),
    ...(hit.TourName ? splitOztixStructuredArtist(hit.TourName) : [])
  ]
    .map((artist) => normalizeWhitespace(artist))
    .filter(Boolean)
    .filter(isLikelyOztixArtistName)
    .filter(
      (artist) =>
        !tributeSubjectIdentities.has(normalizeArtistIdentity(artist))
    )
    .filter((artist) => !isOztixThemePartySubject(hit.EventName, artist));
  const titleHeadlinerArtists =
    structuredArtists.length === 0
      ? [
          ...parseOztixTitleHeadlinerArtists(hit.EventName),
          ...parseOztixTitleLineupArtists(hit.EventName)
        ]
      : [];
  const parsedSpecialGuests = parseOztixSpecialGuests(hit.SpecialGuests);
  const knownArtistsBeforeSpecialGuests = [
    ...structuredArtists,
    ...titleHeadlinerArtists,
    ...titlePresentedArtists,
    ...titleFeaturedArtists
  ];
  const combinedArtists = [
    ...knownArtistsBeforeSpecialGuests,
    ...parsedSpecialGuests
      .filter(
        (artist) =>
          !isDuplicateOrCompositeOztixArtist(
            artist,
            knownArtistsBeforeSpecialGuests
          )
      )
  ]
    .filter(
      (artist) =>
        !tributeSubjectIdentities.has(normalizeArtistIdentity(artist))
    )
    .filter((artist) => !isOztixThemePartySubject(hit.EventName, artist));
  const extractionKind = structuredArtists.length > 0 ? "structured" : "parsed_text";

  return createArtistExtraction(
    dedupeOztixArtistsByIdentity(combinedArtists),
    extractionKind
  );
}

export function isPerthMetroHit(hit: OztixHit): boolean {
  const lat = hit._geoloc?.lat;
  const lng = hit._geoloc?.lng;

  if (!isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
    return false;
  }

  return (
    calculateDistanceKm(PERTH_CBD, {
      lat,
      lng
    }) <= PERTH_METRO_RADIUS_KM
  );
}

export function isMusicGigHit(hit: OztixHit): boolean {
  const normalizedCategories = normalizeCategories(hit);
  const hasMusicCategory = normalizedCategories.some((category) =>
    MUSIC_CATEGORY_KEYWORDS.some((keyword) => category.includes(keyword))
  );
  const hasNonMusicCategory = normalizedCategories.some((category) =>
    NON_MUSIC_CATEGORY_KEYWORDS.some((keyword) => category.includes(keyword))
  );
  const structuredArtists = collectStructuredArtists(hit);
  const parsedArtists = parseOztixSpecialGuests(hit.SpecialGuests);
  const namedArtists = collectNamedArtists(hit);

  if (hasExplicitNonGigSignal(hit) && structuredArtists.length === 0) {
    return false;
  }

  if (hasMusicCategory) {
    return true;
  }

  if (hasNonMusicCategory) {
    return structuredArtists.length > 0 && hasExplicitMusicSignal(hit);
  }

  return namedArtists.length > 0;
}

function normalizeVenue(hit: OztixHit): NormalizedVenue {
  const venue = hit.Venue;
  const venueName = normalizeVenueName(normalizeWhitespace(venue?.Name ?? "Oztix Venue"));

  return {
    name: venueName,
    slug: slugifyVenueName(venueName),
    suburb: venue?.Locality ? normalizeWhitespace(venue.Locality) : null,
    address: venue?.Address ? normalizeWhitespace(venue.Address) : null,
    websiteUrl: normalizeVenueWebsiteUrl(
      venueName,
      normalizeUrl(venue?.WebsiteUrl)
    )
  };
}

function normalizeGigStatus(hit: OztixHit, title: string): GigStatus {
  const normalizedTitle = title.toLowerCase();
  const affectedBy = hit.AffectedBy?.toLowerCase() ?? "";

  if (
    hit.IsCancelled ||
    normalizedTitle.startsWith("cancelled -") ||
    affectedBy.includes("cancel")
  ) {
    return "cancelled";
  }

  if (
    hit.IsPostponed ||
    hit.IsRescheduled ||
    normalizedTitle.startsWith("postponed -") ||
    normalizedTitle.startsWith("rescheduled -") ||
    affectedBy.includes("postpon") ||
    affectedBy.includes("resched")
  ) {
    return "postponed";
  }

  return "active";
}

export function normalizeOztixHit(hit: OztixHit): NormalizedGig {
  const title = normalizeOztixTitle(hit.EventName);
  const startsAt = normalizeUtcDate(hit.DateStart);

  if (!title || !startsAt) {
    throw new Error("Oztix hit is missing a title or start time");
  }

  const venue = normalizeVenue(hit);
  const sourceUrl = normalizeUrl(hit.EventUrl) ?? SOURCE_URL;
  const description = toPlainText(
    [hit.SpecialGuests, hit.EventDescription].filter(Boolean).join("\n\n")
  );
  const artistExtraction = extractOztixArtists(hit);

  return {
    sourceSlug: "oztix-wa",
    externalId: hit.EventGuid?.trim() || null,
    sourceUrl,
    imageUrl: selectPreferredImageUrl(hit),
    title,
    description,
    status: normalizeGigStatus(hit, title),
    startsAt,
    startsAtPrecision: "exact",
    endsAt: normalizeUtcDate(hit.DateEnd),
    ticketUrl: sourceUrl,
    venue,
    artists: artistExtraction.artists,
    artistExtractionKind: artistExtraction.artistExtractionKind,
    rawPayload: JSON.parse(JSON.stringify(hit)) as JsonObject,
    checksum: buildGigChecksum({
      sourceSlug: "oztix-wa",
      startsAt,
      title,
      venueSlug: venue.slug,
      sourceUrl
    })
  };
}

export function parseOztixHits(hits: OztixHit[]): SourceAdapterResult {
  const gigs: NormalizedGig[] = [];
  let failedCount = 0;

  for (const hit of hits) {
    if (hit.HasEventDatePassed || !isPerthMetroHit(hit) || !isMusicGigHit(hit)) {
      continue;
    }

    try {
      gigs.push(normalizeOztixHit(hit));
    } catch {
      failedCount += 1;
    }
  }

  gigs.sort((left, right) =>
    left.startsAt === right.startsAt
      ? left.title.localeCompare(right.title)
      : left.startsAt.localeCompare(right.startsAt)
  );

  return { gigs, failedCount };
}

async function fetchOztixHits(fetchImpl: typeof fetch): Promise<OztixHit[]> {
  const params = new URLSearchParams({
    hitsPerPage: "1000",
    filters: "Venue.State:WA"
  });

  const response = await queryAlgolia<AlgoliaResponse>(
    {
      appId: OZTIX_APP_ID,
      apiKey: OZTIX_API_KEY,
      indexName: OZTIX_INDEX_NAME,
      params: params.toString()
    },
    fetchImpl
  );

  return response.results[0]?.hits ?? [];
}

export const oztixWaSource: SourceAdapter = {
  slug: "oztix-wa",
  name: "Oztix WA",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch) {
    const hits = await fetchOztixHits(fetchImpl);
    return parseOztixHits(hits);
  },
  repairArtists(rawPayload) {
    return extractOztixArtists(rawPayload as OztixHit);
  }
};
