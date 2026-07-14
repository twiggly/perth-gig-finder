import {
  normalizeWhitespace,
  type NormalizedVenue
} from "@perth-gig-finder/shared";

import {
  createArtistExtraction,
  preferArtistDisplayNamesFromTitle
} from "../../artist-utils";
import { loadHtmlFragment } from "../../source-utils/html-text";
import { normalizeMoshtixTitle as normalizeTitle } from "./title";
import type {
  MoshtixEventData,
  MoshtixPresentedShow,
  MoshtixStructuredEvent
} from "./types";

const MOSHTIX_ARTIST_LIST_SEPARATOR_PATTERN = /\s*(?:\+|,)\s*/;
const MOSHTIX_PLACEHOLDER_ARTIST_PATTERN =
  /^(?:(?:local|more|additional|special)\s+)*(?:support|supports|support acts?)\s*(?:to be announced|tba|tbc)?$|^(?:(?:a|an)\s+)?(?:special\s+)?guests?\s*(?:to be announced|tba|tbc)?$|^(?:secret|mystery)\s+(?:act|artist|guest|set)s?[!.]?$|^(?:more|more\s+(?:acts?|artists?|guests?))[!.]?$|^(?:tba|tbc|to be announced|more\s+(?:tba|tbc|to be announced)|more to be announced)$/i;
const MOSHTIX_ARTIST_LABEL_PREFIX_PATTERN =
  /^(?:(?:with|w[/.]?)\s+)?(?:special\s+)?guests?\s*[:,\-]?\s+/i;
const MOSHTIX_TITLE_FEATURE_PATTERN =
  /^(?:(.+?)\s*[|:-;]\s*)?(?:featuring|feat\.?|ft\.?)\s+(.+)$/i;
const MOSHTIX_TITLE_TRAILING_FEATURE_PATTERN =
  /^(.+?)\s+(?:featuring|feat\.?|ft\.?)\s+(.+)$/i;
const MOSHTIX_TITLE_SUPPORT_PATTERN = /^(.+?)\s+(w[/.]\s*|with\s+)(.+)$/i;
const MOSHTIX_TITLE_PRESENTS_PATTERN = /^(.+?)\s+presents\s+(.+)$/i;
const MOSHTIX_TITLE_PRESENTED_BY_PATTERN = /\bpresented by\s+(.+)$/i;
const MOSHTIX_NON_ARTIST_PRESENTER_PATTERN =
  /\b(?:association|club|collective|entertainment|events?|festival|management|orchestra|productions?|promotions?|records?|society|touring|venue)\b/i;
const MOSHTIX_TITLE_WITH_LABEL_LINEUP_PATTERN =
  /\bwith\s+(?:the\s+)?(?:trio|band|artists?|performers?)\s*:\s*(.+)$/i;
const MOSHTIX_TITLE_PLAYED_BY_PATTERN =
  /\bplayed\s+by\s+(.+?)(?:[.!]|$)/i;
const MOSHTIX_TITLE_TOUR_PREFIX_PATTERN = /^(.+?):\s+.+\btour\b/i;
const MOSHTIX_TITLE_QUOTED_RELEASE_TOUR_PATTERN =
  /^(.+?)\s+(?:"[^"]+"|'[^']+'|“[^”]+”|‘[^’]+’)\s+(?:(?:\d+(?:st|nd|rd|th)\s+anniversary|australian|world|national)\s+)*tour\b/i;
const MOSHTIX_TITLE_REGION_SUFFIX_PATTERN =
  /^(.+?)\s*[-–|]\s*(?:australia|australian|perth|fremantle|wa|world|uk|eu|us|au|nz|\d{4}).*$/i;
const MOSHTIX_TITLE_COUNTRY_SUFFIX_PATTERN =
  /^(.+?)\s+\((?:[A-Z]{2,}|UK|USA|NZ|DK|GER|SWE(?:DEN)?|SWEDEN)\)$/i;
const MOSHTIX_TIME_SUFFIX_PATTERN =
  /\s*[|–-]\s*\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)\b.*$/i;
const MOSHTIX_NON_ARTIST_SCHEDULE_LABEL_PATTERN =
  /^(?:band|doors?|event|music|show|tickets?)$/i;
const MOSHTIX_HEADLINED_BY_PATTERN = /\bheadlined by\s+(.+?)(?:\s+with\b|[.!]|$)/i;
const MOSHTIX_DESCRIPTION_LINEUP_PATTERN = /^w(?:[/.]|['’])\s*(.+)$/i;
const MOSHTIX_JOINED_SPECIAL_GUESTS_PATTERN =
  /(?<!\bwas\s)(?<!\bwere\s)(?<!\bbeen\s)\bjoined by special guests?\s+(.+?)(?:,\s+(?:the|this)\b|[.!]|$)/i;
const MOSHTIX_FEATURED_ROLE_ROSTER_PATTERN =
  /\bfull band performance featuring the added talents of\s+(.+?)\s+as they\b/i;
const MOSHTIX_ROLE_PREFIXED_ARTIST_PATTERN =
  /^(?:(?:lead|rhythm)\s+)?(?:drummer|bassist|keyboard(?:\s+player|ist)?|brass\s+arranger|guitarist|vocalist|singer|percussionist|saxophonist|trumpeter|trombonist|violinist|cellist)\s+(.+)$/i;
const MOSHTIX_DJ_LAUNCHES_PATTERN = /\b(DJ\s+.+?)\s+launches\b/i;
const MOSHTIX_DJ_LINE_PATTERN = /\bDJS?\s*:\s*(.+)$/i;
const MOSHTIX_DJ_SEGMENT_SEPARATOR_PATTERN = /\s*[🖤🌹•·●▪▫◆◇★☆*]\s*/u;
const MOSHTIX_MADE_UP_OF_PATTERN = /\bmade up of\b\s+(.+?)(?:[.!]|$)/i;
const MOSHTIX_TITLE_DESCRIPTOR_PATTERN =
  /\s+\((?:[A-Z]{2,}|UK|USA|NZ|DK|GER|SWE(?:DEN)?|SWEDEN|Goanna Band)\)\s*$/i;
const MOSHTIX_DESCRIPTION_STOP_WORDS = new Set([
  "ticketing info",
  "tickets",
  "free entry",
  "under 18",
  "valid form of id"
]);
const MOSHTIX_MUSICIAN_ROLE_PATTERN_SOURCE = String.raw`(?:(?:acoustic|backing|electric|lead|rhythm)\s+)?(?:vocals?|voice|piano|keys?|keyboards?|guitars?|pedal\s+steel\s+guitar|bass(?:\s+guitar)?|double\s+bass|drums?|percussion|sax(?:ophone)?|trumpet|trombone|violin|fiddle|viola|cello|flute|clarinet|organ|synth(?:esizer)?|mandolin|banjo|harp)`;
const MOSHTIX_PERFORMER_CREDIT_LINE_PATTERN = new RegExp(
  String.raw`^(.+?)\s+[-–—]\s+${MOSHTIX_MUSICIAN_ROLE_PATTERN_SOURCE}(?:\s*(?:(?:,|\/|&|\band\b)\s*|\s+)${MOSHTIX_MUSICIAN_ROLE_PATTERN_SOURCE})*\.?$`,
  "i"
);
const MOSHTIX_LABELLED_LINEUP_HEADING_PATTERN =
  /^(?:(?:\d{4}\s+)?line\s*up|djs?\s+lineup|the\s+band)\s*:?$/i;
const MOSHTIX_SUPPORT_LINEUP_HEADING_PATTERN = /^with support from\s*:?$/i;
const MOSHTIX_LABELLED_SINGLE_ARTIST_HEADING_PATTERN = /^presented by\s*:?$/i;
const MOSHTIX_LABELLED_LINEUP_STOP_PATTERN =
  /\b(?:doors?|tickets?|members?|venue|to be announced|ticketing info)\b/i;
const MOSHTIX_TITLE_ARTIST_NOISE_PATTERN =
  /\b(?:music of|presented|presents?|review|session|show|songbook|tribute)\b/i;

export type { ParsedMoshtixSearchPage } from "./types";

function normalizeMoshtixIdentity(value: string): string {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}

function getMoshtixIdentityVariants(value: string | null | undefined): string[] {
  const identity = normalizeMoshtixIdentity(value ?? "");

  if (!identity) {
    return [];
  }

  const compact = identity.replace(/\s+/g, "");
  const variants = [identity, compact];

  if (compact.endsWith("wa")) {
    variants.push(compact.replace(/wa$/, ""));
  } else {
    variants.push(`${compact}wa`);
  }

  return variants;
}

function normalizeMoshtixArtistToken(value: string): string {
  const decoded = normalizeWhitespace(value);

  return normalizeWhitespace(
    decoded
      .replace(/^w[/.]\s*/i, "")
      .replace(MOSHTIX_ARTIST_LABEL_PREFIX_PATTERN, "")
      .replace(MOSHTIX_TIME_SUFFIX_PATTERN, "")
      .replace(/\band more!?$/i, "")
      .replace(/\bwith special guests?.*$/i, "")
      .replace(MOSHTIX_TITLE_DESCRIPTOR_PATTERN, "")
      .replace(/\s*[|:;,-]\s*$/g, "")
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
  );
}

function splitMoshtixArtistList(value: string): string[] {
  const normalized = normalizeMoshtixArtistToken(value);

  if (!normalized) {
    return [];
  }

  return normalized
    .replace(/\s+\band\b\s+/gi, ", ")
    .split(MOSHTIX_ARTIST_LIST_SEPARATOR_PATTERN)
    .map((artist) => normalizeMoshtixArtistToken(artist))
    .filter(Boolean)
    .filter((artist) => !MOSHTIX_PLACEHOLDER_ARTIST_PATTERN.test(artist));
}

function splitMoshtixFeaturedArtistList(value: string): string[] {
  return splitMoshtixArtistList(
    value.replace(/\s+with\s+(?:the\s+)?(?=[A-Z0-9])/g, ", ")
  );
}

function parseMoshtixDjLine(line: string): string[] {
  const match = line.match(MOSHTIX_DJ_LINE_PATTERN);

  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(MOSHTIX_DJ_SEGMENT_SEPARATOR_PATTERN)
    .map((segment) =>
      normalizeMoshtixArtistToken(
        segment.replace(
          /\s*:\s*(?:pre[-\s]?party\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s*[-–]\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|close))?.*$/i,
          ""
        )
      )
    )
    .filter(Boolean)
    .filter((artist) => !MOSHTIX_PLACEHOLDER_ARTIST_PATTERN.test(artist));
}

function parseMoshtixPresentedShow(title: string): MoshtixPresentedShow | null {
  const match = normalizeTitle(title).match(MOSHTIX_TITLE_PRESENTS_PATTERN);

  if (!match?.[1] || !match[2]) {
    return null;
  }

  const presenter = normalizeMoshtixArtistToken(match[1]);
  const showTitle = normalizeWhitespace(match[2]);
  const presenterWords = presenter.split(/\s+/).filter(Boolean);
  const hasUppercaseLetter = /\p{Lu}/u.test(presenter);
  const hasLowercaseLetter = /\p{Ll}/u.test(presenter);

  if (
    presenterWords.length < 2 ||
    presenterWords.length > 4 ||
    !hasUppercaseLetter ||
    !hasLowercaseLetter ||
    MOSHTIX_NON_ARTIST_PRESENTER_PATTERN.test(presenter)
  ) {
    return null;
  }

  return { presenter, showTitle };
}

function addMoshtixShowTitleIdentities(
  identities: Set<string>,
  value: string
): void {
  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return;
  }

  identities.add(normalizeMoshtixIdentity(normalized));

  const bestOfMatch = normalized.match(
    /^(.+?)\s*[-–—:]\s*(?:the\s+)?best\s+of\s+(.+)$/i
  );

  if (bestOfMatch?.[1]) {
    identities.add(normalizeMoshtixIdentity(bestOfMatch[1]));
  }

  if (bestOfMatch?.[2]) {
    identities.add(normalizeMoshtixIdentity(bestOfMatch[2]));
  }

  const descriptorStripped = normalizeWhitespace(
    normalized.replace(
      /\s+(?:unplugged|tribute(?:\s+show)?|show|experience|story|celebration)\b.*$/i,
      ""
    )
  );

  if (descriptorStripped && descriptorStripped !== normalized) {
    identities.add(normalizeMoshtixIdentity(descriptorStripped));
  }
}

function filterMoshtixPresentedShowArtists(
  artists: string[],
  presentedShow: MoshtixPresentedShow | null
): string[] {
  if (!presentedShow) {
    return artists;
  }

  const presenterIdentity = normalizeMoshtixIdentity(presentedShow.presenter);
  const promotionalIdentities = new Set<string>();
  addMoshtixShowTitleIdentities(promotionalIdentities, presentedShow.showTitle);

  for (const artist of artists) {
    const match = artist.match(MOSHTIX_TITLE_PRESENTS_PATTERN);

    if (
      match?.[1] &&
      match[2] &&
      normalizeMoshtixIdentity(match[1]) === presenterIdentity
    ) {
      promotionalIdentities.add(normalizeMoshtixIdentity(artist));
      addMoshtixShowTitleIdentities(promotionalIdentities, match[2]);
    }
  }

  return artists.filter((artist) => {
    const identity = normalizeMoshtixIdentity(artist);
    return identity === presenterIdentity || !promotionalIdentities.has(identity);
  });
}

export interface MoshtixDescriptionContext {
  plainText: string | null;
  prominentLines: string[];
  performerCreditLines: string[];
}

export function createMoshtixDescriptionContext(
  descriptionHtml: string | null | undefined
): MoshtixDescriptionContext {
  if (!descriptionHtml) {
    return {
      plainText: null,
      prominentLines: [],
      performerCreditLines: []
    };
  }

  const { $, root } = loadHtmlFragment(
    descriptionHtml,
    "data-moshtix-description-root"
  );
  const plainText = normalizeWhitespace(root.text()) || null;
  const prominentLines = root
    .children()
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter(Boolean);
  const performerCreditLines: string[] = [];

  root.find("br").replaceWith("\n");
  root.find("li").append("\n");
  root.children().each((_, element) => {
    for (const value of $(element).text().split(/\n+/)) {
      const line = normalizeWhitespace(value);

      if (line) {
        performerCreditLines.push(line);
      }
    }
  });

  return {
    plainText,
    prominentLines,
    performerCreditLines
  };
}

function normalizeMoshtixLineupHeading(value: string): string {
  return normalizeWhitespace(value.replace(/^[^\p{L}\p{N}]+/u, ""));
}

function isLikelyMoshtixLabelledArtistLine(value: string): boolean {
  const normalized = normalizeWhitespace(value);

  if (
    !normalized ||
    normalized.length > 100 ||
    MOSHTIX_LABELLED_LINEUP_STOP_PATTERN.test(normalized) ||
    MOSHTIX_PLACEHOLDER_ARTIST_PATTERN.test(normalized)
  ) {
    return false;
  }

  if (/[.!?]$/.test(normalized)) {
    return false;
  }

  return normalized.split(/\s+/).length <= 10 || /[,+•·]/u.test(normalized);
}

function parseMoshtixLabelledLineupBlocks(
  lines: string[]
): { artists: string[]; hasSupportBlock: boolean } {
  const artists: string[] = [];
  let hasSupportBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const heading = normalizeMoshtixLineupHeading(lines[index] ?? "");
    const isSupportBlock = MOSHTIX_SUPPORT_LINEUP_HEADING_PATTERN.test(heading);
    const isLineupBlock =
      isSupportBlock || MOSHTIX_LABELLED_LINEUP_HEADING_PATTERN.test(heading);
    const isSingleArtistBlock = MOSHTIX_LABELLED_SINGLE_ARTIST_HEADING_PATTERN.test(
      heading
    );

    if (!isLineupBlock && !isSingleArtistBlock) {
      continue;
    }

    hasSupportBlock ||= isSupportBlock;
    const maximumLines = isSingleArtistBlock ? 1 : 50;

    for (
      let candidateIndex = index + 1;
      candidateIndex < lines.length && candidateIndex <= index + maximumLines;
      candidateIndex += 1
    ) {
      const candidateLine = normalizeWhitespace(lines[candidateIndex] ?? "");

      if (!isLikelyMoshtixLabelledArtistLine(candidateLine)) {
        break;
      }

      artists.push(
        ...splitMoshtixArtistList(
          candidateLine.replace(/\s*[•·●▪▫◆◇★☆]\s*/gu, ", ")
        )
      );
    }
  }

  return { artists, hasSupportBlock };
}

function parseMoshtixRolePrefixedArtistList(value: string): string[] {
  const tokens = normalizeWhitespace(value)
    .replace(/\s+\band\b\s+/gi, ", ")
    .split(/\s*,\s*/)
    .filter(Boolean);
  const artists = tokens
    .map((token) => token.match(MOSHTIX_ROLE_PREFIXED_ARTIST_PATTERN)?.[1] ?? null)
    .map((artist) => (artist ? normalizeMoshtixArtistToken(artist) : null));

  if (artists.length < 2 || artists.some((artist) => !artist)) {
    return [];
  }

  return artists.filter((artist): artist is string => Boolean(artist));
}

function parseMoshtixCurrentBillingArtists(line: string): string[] {
  const specialGuestsMatch = line.match(MOSHTIX_JOINED_SPECIAL_GUESTS_PATTERN);

  if (specialGuestsMatch?.[1]) {
    return splitMoshtixArtistList(specialGuestsMatch[1]);
  }

  const roleRosterMatch = line.match(MOSHTIX_FEATURED_ROLE_ROSTER_PATTERN);

  return roleRosterMatch?.[1]
    ? parseMoshtixRolePrefixedArtistList(roleRosterMatch[1])
    : [];
}

function parseMoshtixPerformerCreditLine(line: string): string | null {
  const match = line.match(MOSHTIX_PERFORMER_CREDIT_LINE_PATTERN);

  if (!match?.[1]) {
    return null;
  }

  const artist = normalizeMoshtixArtistToken(match[1]);

  return artist && !MOSHTIX_PLACEHOLDER_ARTIST_PATTERN.test(artist) ? artist : null;
}

function parseMoshtixTitleArtists(
  title: string,
  presentedShow: MoshtixPresentedShow | null = null
): string[] {
  const normalized = normalizeTitle(title);

  if (!normalized) {
    return [];
  }

  const candidates: string[] = [];
  const quotedReleaseTourMatch = normalized.match(
    MOSHTIX_TITLE_QUOTED_RELEASE_TOUR_PATTERN
  );

  if (quotedReleaseTourMatch?.[1]) {
    candidates.push(normalizeMoshtixArtistToken(quotedReleaseTourMatch[1]));
  }
  const presentedByMatch = normalized.match(MOSHTIX_TITLE_PRESENTED_BY_PATTERN);

  if (presentedByMatch?.[1]) {
    candidates.push(...splitMoshtixArtistList(presentedByMatch[1]));
  }
  const labelLineupMatch = normalized.match(MOSHTIX_TITLE_WITH_LABEL_LINEUP_PATTERN);

  if (labelLineupMatch?.[1]) {
    candidates.push(...splitMoshtixArtistList(labelLineupMatch[1]));
    return candidates;
  }

  const playedByMatch = normalized.match(MOSHTIX_TITLE_PLAYED_BY_PATTERN);

  if (playedByMatch?.[1]) {
    candidates.push(...splitMoshtixArtistList(playedByMatch[1]));
    return candidates;
  }

  if (presentedShow) {
    return [presentedShow.presenter];
  }

  const supportMatch = normalized.match(MOSHTIX_TITLE_SUPPORT_PATTERN);

  if (isLikelyMoshtixTitleSupportMatch(supportMatch)) {
    candidates.push(...splitMoshtixArtistList(supportMatch[1]));
    candidates.push(...splitMoshtixArtistList(supportMatch[3]));
    return candidates;
  }

  const trailingFeatureMatch = normalized.match(MOSHTIX_TITLE_TRAILING_FEATURE_PATTERN);

  if (trailingFeatureMatch?.[2]) {
    candidates.push(...splitMoshtixFeaturedArtistList(trailingFeatureMatch[2]));
    return candidates;
  }

  const featureMatch = normalized.match(MOSHTIX_TITLE_FEATURE_PATTERN);

  if (featureMatch) {
    const [, maybeHeadliner, featured] = featureMatch;
    const isSideFeaturePattern = /[;:]\s*(?:featuring|feat\.?|ft\.?)/i.test(normalized);

    if (maybeHeadliner && !isSideFeaturePattern) {
      candidates.push(...splitMoshtixArtistList(maybeHeadliner));
    }

    candidates.push(...splitMoshtixFeaturedArtistList(featured));
  }

  if (normalized.includes(" + ")) {
    candidates.push(...splitMoshtixArtistList(normalized));
  }

  const tourPrefixMatch = normalized.match(MOSHTIX_TITLE_TOUR_PREFIX_PATTERN);
  if (tourPrefixMatch) {
    candidates.push(normalizeMoshtixArtistToken(tourPrefixMatch[1]));
  }

  const regionSuffixMatch = normalized.match(MOSHTIX_TITLE_REGION_SUFFIX_PATTERN);
  if (regionSuffixMatch && /[+,]/.test(regionSuffixMatch[1])) {
    candidates.push(...splitMoshtixArtistList(regionSuffixMatch[1]));
  }

  const countrySuffixMatch = normalized.match(MOSHTIX_TITLE_COUNTRY_SUFFIX_PATTERN);
  if (countrySuffixMatch) {
    candidates.push(normalizeMoshtixArtistToken(countrySuffixMatch[1]));
  }

  return candidates;
}

function isLikelyMoshtixTitleSupportMatch(
  match: RegExpMatchArray | null
): match is RegExpMatchArray {
  if (!match?.[2] || !match[3]) {
    return false;
  }

  if (/^w[/.]/i.test(match[2])) {
    return true;
  }

  return /(?:\+|,|\bmore\b|\bspecial\s+guests?\b|\bsupports?\b|\btba\b|\btbc\b)/i.test(
    match[3]
  );
}

function parseMoshtixDescriptionArtists(
  descriptionContext: MoshtixDescriptionContext,
  title: string | null | undefined
): string[] {
  const lines = descriptionContext.prominentLines;
  const labelledLineup = parseMoshtixLabelledLineupBlocks(
    descriptionContext.performerCreditLines
  );
  const performerCreditArtists = descriptionContext.performerCreditLines
    .map(parseMoshtixPerformerCreditLine)
    .filter((artist): artist is string => Boolean(artist));
  const normalizedTitle = normalizeTitle(title);
  const hasStandaloneTitleCredit =
    (performerCreditArtists.length >= 2 || labelledLineup.hasSupportBlock) &&
    normalizedTitle.split(/\s+/).length >= 2 &&
    normalizedTitle.split(/\s+/).length <= 5 &&
    !/["“”‘’:+|]/u.test(normalizedTitle) &&
    !MOSHTIX_TITLE_ARTIST_NOISE_PATTERN.test(normalizedTitle) &&
    lines.some(
      (line) => normalizeMoshtixIdentity(line) === normalizeMoshtixIdentity(normalizedTitle)
    );
  const candidates: string[] = [
    ...(hasStandaloneTitleCredit ? [normalizedTitle] : []),
    ...labelledLineup.artists
  ];

  for (const line of lines.slice(0, 12)) {
    const lowered = line.toLowerCase();

    if (MOSHTIX_DESCRIPTION_STOP_WORDS.has(lowered)) {
      break;
    }

    const lineupMatch = line.match(MOSHTIX_DESCRIPTION_LINEUP_PATTERN);
    if (lineupMatch?.[1]) {
      candidates.push(...splitMoshtixArtistList(lineupMatch[1]));
    }

    candidates.push(...parseMoshtixCurrentBillingArtists(line));

    const isDjLine = MOSHTIX_DJ_LINE_PATTERN.test(line);

    if (!isDjLine && line !== line.replace(MOSHTIX_TIME_SUFFIX_PATTERN, "")) {
      const timedArtistLine = normalizeMoshtixArtistToken(
        line.replace(MOSHTIX_TIME_SUFFIX_PATTERN, "")
      );

      if (!MOSHTIX_NON_ARTIST_SCHEDULE_LABEL_PATTERN.test(timedArtistLine)) {
        candidates.push(...splitMoshtixArtistList(timedArtistLine));
      }
    }

    candidates.push(...parseMoshtixDjLine(line));

    const headlinedMatch = line.match(MOSHTIX_HEADLINED_BY_PATTERN);
    if (headlinedMatch) {
      candidates.push(...splitMoshtixArtistList(headlinedMatch[1]));
    }

    const madeUpOfMatch = line.match(MOSHTIX_MADE_UP_OF_PATTERN);
    if (madeUpOfMatch) {
      const madeUpOfArtists = splitMoshtixArtistList(
        madeUpOfMatch[1].replace(
          /^(?:[A-Z][a-z]+(?:\s+[A-Za-z]+){0,2}\s+musicians\s+)/,
          ""
        )
      );

      if (madeUpOfArtists.length >= 2) {
        candidates.push(...madeUpOfArtists);
      }
    }

    const djLaunchesMatch = line.match(MOSHTIX_DJ_LAUNCHES_PATTERN);
    if (djLaunchesMatch) {
      candidates.push(normalizeMoshtixArtistToken(djLaunchesMatch[1]));
    }
  }

  candidates.push(...performerCreditArtists);

  return candidates;
}

function dedupeMoshtixArtistsByIdentity(artists: string[]): string[] {
  const seenIdentities = new Set<string>();
  const dedupedArtists: string[] = [];

  for (const artist of artists) {
    const identity = normalizeMoshtixIdentity(artist);

    if (!identity || seenIdentities.has(identity)) {
      continue;
    }

    seenIdentities.add(identity);
    dedupedArtists.push(artist);
  }

  return dedupedArtists;
}

function orderMoshtixArtistsByCompleteDescriptionLineup(
  artists: string[],
  descriptionArtists: string[]
): string[] {
  if (artists.length < 2 || descriptionArtists.length < artists.length) {
    return artists;
  }

  const artistsByIdentity = new Map(
    artists.map((artist) => [normalizeMoshtixIdentity(artist), artist] as const)
  );
  const descriptionIdentities = descriptionArtists.map(normalizeMoshtixIdentity);

  if (![...artistsByIdentity.keys()].every((identity) => descriptionIdentities.includes(identity))) {
    return artists;
  }

  const orderedArtists = descriptionIdentities
    .map((identity) => artistsByIdentity.get(identity))
    .filter((artist): artist is string => Boolean(artist));

  return [...new Set(orderedArtists)];
}

export interface MoshtixArtistExtractionInput {
  title: string;
  descriptionHtml: string | null;
  structuredEvent: MoshtixStructuredEvent | null;
  eventData: MoshtixEventData | null;
  venue: NormalizedVenue;
}

export function extractMoshtixArtists(input: MoshtixArtistExtractionInput) {
  return extractMoshtixArtistsFromContext(
    input,
    createMoshtixDescriptionContext(input.descriptionHtml)
  );
}

export function extractMoshtixArtistsFromContext(
  input: MoshtixArtistExtractionInput,
  descriptionContext: MoshtixDescriptionContext
) {
  const identityCache = new Map<string, string>();
  const getIdentity = (value: string) => {
    const cachedIdentity = identityCache.get(value);

    if (cachedIdentity !== undefined) {
      return cachedIdentity;
    }

    const identity = normalizeMoshtixIdentity(value);
    identityCache.set(value, identity);
    return identity;
  };
  const venueIdentities = new Set(
    [
      input.venue.name,
      input.eventData?.venue?.name,
      input.eventData?.client?.name,
      input.structuredEvent?.location?.name
    ].flatMap(getMoshtixIdentityVariants)
  );
  const isVenueArtist = (artist: string) =>
    getMoshtixIdentityVariants(artist).some((identity) => venueIdentities.has(identity));
  const isNoisyArtist = (artist: string) => {
    const normalized = artist.toLowerCase();

    return (
      isVenueArtist(artist) ||
      normalized.includes("homepage gallery") ||
      normalized === "sunday session"
    );
  };

  const rawCandidates = [
    ...(input.eventData?.artists ?? []),
    ...((input.structuredEvent?.performers ?? []).map((performer) => performer.name ?? ""))
  ]
    .map((artist) => normalizeMoshtixArtistToken(artist))
    .filter(Boolean)
    .filter((artist) => !isNoisyArtist(artist));

  const parsedPresentedShow = parseMoshtixPresentedShow(input.title);
  const acceptedPresentedShow =
    parsedPresentedShow &&
    (rawCandidates.length === 0 ||
      rawCandidates.some(
        (artist) =>
          getIdentity(artist) === getIdentity(parsedPresentedShow.presenter)
      ))
      ? parsedPresentedShow
      : null;
  let candidates = filterMoshtixPresentedShowArtists(
    rawCandidates,
    acceptedPresentedShow
  );
  const parsedTitleCandidates = parseMoshtixTitleArtists(
    input.title,
    acceptedPresentedShow
  );
  const parsedDescriptionCandidates = parseMoshtixDescriptionArtists(
    descriptionContext,
    input.title
  );
  candidates = candidates.filter((candidate) => {
    const candidateIdentity = getIdentity(candidate);

    return !parsedDescriptionCandidates.some((parsedArtist) => {
      const parsedIdentity = getIdentity(parsedArtist);

      return (
        parsedIdentity.length >= 3 &&
        parsedIdentity !== candidateIdentity &&
        candidateIdentity.includes(parsedIdentity) &&
        /\([^)]*\)|\b(?:act|nsw|nt|qld|sa|tas|vic|wa)\b\s*$/i.test(candidate)
      );
    });
  });
  const parsedCandidates = [...parsedTitleCandidates, ...parsedDescriptionCandidates]
    .map((artist) => normalizeWhitespace(artist))
    .filter(Boolean)
    .filter((artist) => !isNoisyArtist(artist))
    .filter(
      (artist) =>
        candidates.length === 0 ||
        !candidates.some(
          (candidate) =>
            getIdentity(artist).startsWith(getIdentity(candidate)) &&
            /\b(?:tour|album|single|launch|fremantle|perth|solo)\b/i.test(artist)
        )
    );

  if (candidates.length > 0) {
    const normalizedTitle = normalizeTitle(input.title);
    const titleSupportMatch = normalizedTitle.match(MOSHTIX_TITLE_SUPPORT_PATTERN);
    const orderedCandidates = isLikelyMoshtixTitleSupportMatch(titleSupportMatch)
      ? [...parsedTitleCandidates, ...candidates, ...parsedDescriptionCandidates]
      : [...candidates, ...parsedCandidates];

    const displayArtists = preferArtistDisplayNamesFromTitle(
      dedupeMoshtixArtistsByIdentity(orderedCandidates),
      input.title
    );

    return createArtistExtraction(
      orderMoshtixArtistsByCompleteDescriptionLineup(
        displayArtists,
        parsedDescriptionCandidates
      ),
      "structured"
    );
  }

  const displayArtists = preferArtistDisplayNamesFromTitle(
    dedupeMoshtixArtistsByIdentity(parsedCandidates),
    input.title
  );

  return createArtistExtraction(
    orderMoshtixArtistsByCompleteDescriptionLineup(
      displayArtists,
      parsedDescriptionCandidates
    ),
    "parsed_text"
  );
}
