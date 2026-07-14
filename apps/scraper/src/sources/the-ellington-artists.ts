import * as cheerio from "cheerio";

import { normalizeWhitespace, slugify } from "@perth-gig-finder/shared";

import { createArtistExtraction } from "../artist-utils";
import { loadHtmlFragment } from "../source-utils/html-text";

const MUSICIAN_ROLE_PATTERN_SOURCE = String.raw`(?:(?:acoustic|alto|backing|baritone|electric|lead|rhythm|soprano|tenor)\s+)?(?:vocals?|voice|piano|keys?|keyboards?|guitars?|bass(?:\s+guitar)?|double\s+bass|drums?|drum\s+kit|percussion|sax(?:es|ophone)?|trumpet|trombone|violin|viola|cello|flute|clarinet|organ|hammond\s+organ|accordi[oa]n|synth(?:esizer)?|modular\s+synth|mandolin|banjo|harp|didgeridoo|tabla|e?sarod|ewi|rhodes|bongos?|cajon|congas?|timbales|tambourine|riq\s+tambourine|maracas|g[üu]iro|clave|bell|horns?|charts?|mc|sound\s+engineer|composer|compositions?|arranger|band\s+leader)(?:\s+\d+)?`;
const MUSICIAN_ROLE_PATTERN = new RegExp(
  String.raw`^${MUSICIAN_ROLE_PATTERN_SOURCE}(?:\s*(?:,|\/|&|\band\b|[-–—])\s*${MUSICIAN_ROLE_PATTERN_SOURCE})*\.?$`,
  "i"
);
const PERFORMER_CREDIT_PATTERN = new RegExp(
  String.raw`^(.+?)\s+[-–—]\s+(${MUSICIAN_ROLE_PATTERN_SOURCE}(?:\s*(?:,|\/|&|\band\b|[-–—])\s*${MUSICIAN_ROLE_PATTERN_SOURCE})*)(?:\s*\([^)]*\))?\.?$`,
  "i"
);
const REVERSE_PERFORMER_CREDIT_PATTERN = new RegExp(
  String.raw`^(?:(?:and\s+joining\s+us.+?,\s*)?(?:on\s+)?)(${MUSICIAN_ROLE_PATTERN_SOURCE}(?:\s*(?:,|\/|&|\band\b|[-–—])\s*${MUSICIAN_ROLE_PATTERN_SOURCE})*)\s*:\s*(.+?)\.?$`,
  "i"
);
const REVERSE_DASH_PERFORMER_CREDIT_PATTERN = new RegExp(
  String.raw`^(${MUSICIAN_ROLE_PATTERN_SOURCE}(?:\s*(?:,|\/|&|\band\b|[-–—])\s*${MUSICIAN_ROLE_PATTERN_SOURCE})*)\s+[-–—]\s+(.+?)\.?$`,
  "i"
);
const REVERSE_COMPACT_DASH_PERFORMER_CREDIT_PATTERN = new RegExp(
  String.raw`^(${MUSICIAN_ROLE_PATTERN_SOURCE}(?:\s*(?:,|\/|&|\band\b|[-–—])\s*${MUSICIAN_ROLE_PATTERN_SOURCE})*)\s*[-–—]\s*(.+?)\.?$`,
  "i"
);
const PARENTHETICAL_CREDIT_PATTERN = new RegExp(
  String.raw`([^,;]+?)\s*\((${MUSICIAN_ROLE_PATTERN_SOURCE}(?:\s*(?:,|\/|&|\band\b)\s*${MUSICIAN_ROLE_PATTERN_SOURCE})*)\)`,
  "gi"
);
const PERFORMANCE_CONTEXT_PATTERN =
  /\b(?:accompanied by|at the helm is|at the (?:keys?|piano)|band includes?|cabaret artists?|comprised of|directed by|direction of|featuring|fronted by|ft\.? special guests?|joined by|joined on stage by|led by|line[ -]?up|performed by|show features?|starring|unleash(?:e[sd]?|ing)?|with a band of|with .*?\bon\b)\b/i;
const REPERTOIRE_OR_REFERENCE_CONTEXT_PATTERN =
  /\b(?:album by|artists? such as|influenced by|inspired by|made famous by|music by|music of|review|songs? by|tribute to)\b/i;
const NON_ARTIST_NAME_PATTERN =
  /^(?:about .+|album launch|australian jazz|band|bandcamp|bio|creative team|facebook|featuring|friends|instagram|linkedin|magazine 6000|more about .+|rhythms|seating for .+|the australian|the guardian|the music|tickets?|trumpet|website|x|youtube)$/i;
const NON_ARTIST_PHRASE_PATTERN =
  /\b(?:accessed by stairs|capacity is limited|entry is first|event is proudly|pre-purchased records|runs for \d+ minutes|sold separately|tickets? (?:are|include)|world['’]s greatest)\b/i;
const TITLE_LOCATION_SUFFIX_PATTERN =
  /\s*\((?:ACT|AUS|AU|DK|GER|MEL|NSW|NZ|PARIS|QLD|SA|SWE(?:DEN)?|UK|USA|VIC|WA)\)\s*$/i;
const TITLE_CONCEPT_PATTERN =
  /(?:^(?:Hammer Head|Mismatched|NOIR|This is Jazz)!?$|\b(?:album launch|appreciation|bastille day|bringing back|concert|festival|jam|jazz night|juke joint|meets|music from|music of|prize|recital|riot|session|showcase|songbook|sounds? of|story|tribute|women (?:in|of))\b)/i;
const ENSEMBLE_SUFFIX_PATTERN =
  /(?:\bjazzband\b|\b(?:band|collective|combo|ensemble|orchestra|project|quartet|quintet|sextet|trio)\b)/i;
const ARTIST_DISPLAY_CORRECTIONS = new Map([
  ["alfred-bangez", "Alfred Bangezhano"],
  ["antonio-celeberti", "Antonio Celiberti"],
  ["gina-williams", "Gina Williams-Ghouse"],
  ["glen-walsh", "Glen Walsh"],
  ["jackson-van-ballegooyen", "Jackson van Ballegooyen"],
  ["james-morrison", "James Morrison"],
  ["james-morrison-quartet", "James Morrison Quartet"],
  ["karl-florrison", "Karl Florisson"],
  ["mckale-barret", "McKale Barrett"],
  ["shameem-taheri-lee", "Shameem"],
  ["sylvia-cornes", "Sylvia Cornes (Sylvie)"],
  ["sylvie-cornes", "Sylvia Cornes (Sylvie)"],
  ["the-beaufort-street-blues-band", "Beaufort Street Blues Band"],
  ["the-glen-walsh-quartet", "Glen Walsh Quartet"],
  ["the-harry-mitchell-trio", "Harry Mitchell Trio"],
  ["nic-jaksa", "Nicky J"],
  ["tara-tiba", "Tara Tiba"],
  ["vini-prates", "Vinicius Prates"]
]);
const NON_ARTIST_PRESENTER_PATTERN =
  /\b(?:colleges?|events?|productions?|promotions?|records?|schools?|venue|wok)\b/i;

function normalizeArtistIdentity(value: string): string {
  return slugify(
    normalizeWhitespace(value)
      .replace(/\band\b/gi, "&")
      .replace(/\baward[- ]winning\b/gi, "")
      .replace(TITLE_LOCATION_SUFFIX_PATTERN, "")
  );
}

function normalizeEllingtonArtistName(value: string): string {
  const normalized = normalizeWhitespace(value)
    .replace(/^(?:and|&|featuring|ft\.?)\s+/i, "")
    .replace(
      /^(?:join jazz musicians|joined by|the extraordinary backing of|the line-?up features?|the lineup features?)\s+/i,
      ""
    )
    .replace(/^(?:Dr|Professor|Sir|Earl|Viscount|Duke|Lord|Count)\.?\s+/i, "")
    .replace(/^Baron\s+von\s+/i, "")
    .replace(/^direction of\s+/i, "")
    .replace(/^directed by\s+/i, "")
    .replace(/\s+band\s+leader$/i, "")
    .replace(/^WA Youth Jazz Orchestra['’]s\s+\(WAYJO\)\s+/i, "")
    .replace(/\s+\(WAYJO NC\)$/i, "")
    .replace(TITLE_LOCATION_SUFFIX_PATTERN, "")
    .replace(/\s+featuring\s+.+$/i, "")
    .replace(/^[“”"']+|[“”"'.:]+$/g, "")
    .trim();

  return ARTIST_DISPLAY_CORRECTIONS.get(normalizeArtistIdentity(normalized)) ?? normalized;
}

function isLikelyArtistName(value: string): boolean {
  const normalized = normalizeEllingtonArtistName(value);

  if (!normalized || normalized.length > 90 || NON_ARTIST_NAME_PATTERN.test(normalized)) {
    return false;
  }

  if (NON_ARTIST_PHRASE_PATTERN.test(normalized) || MUSICIAN_ROLE_PATTERN.test(normalized)) {
    return false;
  }

  if (/^the\s+\d{4}\b/i.test(normalized)) {
    return false;
  }

  if (new RegExp(`^${MUSICIAN_ROLE_PATTERN_SOURCE}\\s*\\(`, "i").test(normalized)) {
    return false;
  }

  if (/https?:|@|★|⭐/u.test(normalized) || /[.!?].+\s/.test(normalized)) {
    return false;
  }

  return normalized.split(/\s+/).length <= 8;
}

function expandSharedSurnamePair(left: string, right: string): [string, string] {
  const leftWords = left.split(/\s+/);
  const rightWords = right.split(/\s+/);

  if (leftWords.length === 1 && rightWords.length >= 2) {
    return [`${left} ${rightWords[rightWords.length - 1]}`, right];
  }

  return [left, right];
}

function splitExplicitArtistList(value: string): string[] {
  const normalized = normalizeWhitespace(value)
    .replace(/^(?:this show\s+)?features?\s+/i, "")
    .replace(/^starring\s+/i, "");
  const commaParts = normalized
    .split(/\s*,\s*/)
    .map(normalizeEllingtonArtistName)
    .filter(Boolean);

  if (commaParts.length > 1) {
    return commaParts.flatMap((part) => splitExplicitArtistList(part));
  }

  const conjunctionMatch = normalized.match(/^(.+?)\s+(?:&|and)\s+(.+)$/i);

  if (!conjunctionMatch?.[1] || !conjunctionMatch[2] || /^the\s+/i.test(conjunctionMatch[2])) {
    return isLikelyArtistName(normalized) ? [normalizeEllingtonArtistName(normalized)] : [];
  }

  const [left, right] = expandSharedSurnamePair(
    normalizeEllingtonArtistName(conjunctionMatch[1]),
    normalizeEllingtonArtistName(conjunctionMatch[2])
  );

  return [left, right].filter(isLikelyArtistName);
}

function parseParentheticalCredits(value: string): string[] {
  const artists: string[] = [];

  for (const match of value.matchAll(PARENTHETICAL_CREDIT_PATTERN)) {
    if (match[1] && !/[-–—]/.test(match[1])) {
      artists.push(...splitExplicitArtistList(match[1]));
    }
  }

  return artists;
}

function parsePerformerCredit(value: string): string[] {
  const normalized = normalizeWhitespace(value);
  const specialGuestsMatch = normalized.match(
    new RegExp(
      String.raw`^ft\.?\s+special\s+guests?\s+(.+?)\s+[-–—]\s+${MUSICIAN_ROLE_PATTERN_SOURCE}(?:\s*(?:,|\/|&|\band\b)\s*${MUSICIAN_ROLE_PATTERN_SOURCE})*\s+[-–—]\s+(.+)$`,
      "i"
    )
  );

  if (specialGuestsMatch?.[1] && specialGuestsMatch[2]) {
    return [specialGuestsMatch[1], specialGuestsMatch[2]].flatMap(
      splitExplicitArtistList
    );
  }

  const performerMatch = normalized.match(PERFORMER_CREDIT_PATTERN);

  if (performerMatch?.[1]) {
    return splitExplicitArtistList(performerMatch[1]);
  }

  const reverseMatch = normalized.match(REVERSE_PERFORMER_CREDIT_PATTERN);

  if (reverseMatch?.[2]) {
    return splitExplicitArtistList(reverseMatch[2]);
  }

  const reverseDashMatch = normalized.match(REVERSE_DASH_PERFORMER_CREDIT_PATTERN);

  if (reverseDashMatch?.[2]) {
    return splitExplicitArtistList(reverseDashMatch[2]);
  }

  const compactReverseDashMatch = normalized.match(
    REVERSE_COMPACT_DASH_PERFORMER_CREDIT_PATTERN
  );

  return compactReverseDashMatch?.[1]?.includes(" ") && compactReverseDashMatch[2]
    ? splitExplicitArtistList(compactReverseDashMatch[2])
    : [];
}

interface EllingtonDescriptionContext {
  $: ReturnType<typeof cheerio.load>;
  identityByName: Map<string, string>;
  lines: string[];
  plainText: string;
  root: ReturnType<typeof loadHtmlFragment>["root"];
}

function createEllingtonDescriptionContext(
  contentHtml: string
): EllingtonDescriptionContext {
  const { $, root } = loadHtmlFragment(
    contentHtml,
    "data-ellington-description-root"
  );
  const plainText = normalizeWhitespace(root.text());
  const lineRoot = root.clone();
  const lines: string[] = [];

  lineRoot.find("br").replaceWith("\n");
  lineRoot.children().each((_, element) => {
    for (const value of $(element).text().split(/\n+/)) {
      const line = normalizeWhitespace(value);

      if (line) {
        lines.push(line);
      }
    }
  });

  return {
    $,
    identityByName: new Map(),
    lines,
    plainText,
    root
  };
}

function getArtistIdentity(
  context: EllingtonDescriptionContext,
  artist: string
): string {
  const cached = context.identityByName.get(artist);

  if (cached !== undefined) {
    return cached;
  }

  const identity = normalizeArtistIdentity(artist);
  context.identityByName.set(artist, identity);
  return identity;
}

function extractFormationArtists(context: EllingtonDescriptionContext): string[] {
  const match = context.plainText.match(
    /\bwas formed\b.{0,120}?\bby\s+(.+?)\s+and since\b/i
  );

  return match?.[1] ? splitExplicitArtistList(match[1]) : [];
}

function extractNamedEnsembleLeader(
  title: string,
  context: EllingtonDescriptionContext,
  creditedArtists: string[]
): string[] {
  if (TITLE_CONCEPT_PATTERN.test(title)) {
    return [];
  }

  const normalizedTitle = normalizeWhitespace(title)
    .replace(TITLE_LOCATION_SUFFIX_PATTERN, "")
    .replace(/^THE\s+/i, "");
  const match = normalizedTitle.match(
    /^(.+?)\s+(?:band|combo|quartet|quintet|sextet|trio)\b/i
  );
  const candidate = match?.[1]
    ? normalizeEllingtonArtistName(match[1])
    : "";

  if (
    !candidate ||
    candidate.split(/\s+/).length !== 2 ||
    !isLikelyArtistName(candidate) ||
    creditedArtists.some(
      (artist) => getArtistIdentity(context, artist) === getArtistIdentity(context, candidate)
    )
  ) {
    return [];
  }

  const escapedCandidate = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const isExplicitLeader = new RegExp(
    String.raw`\b${escapedCandidate}\b`,
    "i"
  ).test(context.plainText);

  return isExplicitLeader ? [candidate] : [];
}

interface EllingtonHtmlNode {
  type: string;
  name?: string;
  data?: string;
  next?: EllingtonHtmlNode | null;
  children?: EllingtonHtmlNode[];
}

function getNodeText(node: EllingtonHtmlNode): string {
  if (node.type === "text") {
    return node.data ?? "";
  }

  if (node.type === "tag" && node.name === "br") {
    return "\n";
  }

  return (node.children ?? []).map(getNodeText).join("");
}

function collectSiblingTextUntilStrong(element: unknown): string {
  const values: string[] = [];
  let sibling = (element as EllingtonHtmlNode).next;

  while (sibling) {
    if (sibling.type === "tag" && sibling.name === "strong") {
      break;
    }

    values.push(getNodeText(sibling));

    sibling = sibling.next;
  }

  return normalizeWhitespace(values.join(" "));
}

function collectSiblingTextSinceStrong(element: unknown): string {
  const values: string[] = [];
  let sibling = (element as EllingtonHtmlNode & { prev?: EllingtonHtmlNode | null }).prev;

  while (sibling) {
    if (sibling.type === "tag" && sibling.name === "strong") {
      break;
    }

    values.unshift(getNodeText(sibling));
    sibling = (sibling as EllingtonHtmlNode & { prev?: EllingtonHtmlNode | null }).prev;
  }

  return normalizeWhitespace(values.join(" "));
}

function isTributeOrRepertoireSubject(title: string, artist: string): boolean {
  const normalizedTitle = normalizeWhitespace(title).toLowerCase();
  const normalizedArtist = normalizeWhitespace(artist).toLowerCase();

  return [
    `music of ${normalizedArtist}`,
    `${normalizedArtist} songbook`,
    `${normalizedArtist} tribute`,
    `tribute to ${normalizedArtist}`
  ].some((phrase) => normalizedTitle.includes(phrase));
}

function extractMarkedArtists(
  title: string,
  context: EllingtonDescriptionContext
): string[] {
  const { $, root } = context;
  const titleCandidateIdentities = getTitleCandidates(title).map((candidate) =>
    getArtistIdentity(context, candidate)
  );
  const artists: string[] = [];

  root.find("strong").each((_, element) => {
    const markedText = normalizeWhitespace($(element).text());
    const parentText = normalizeWhitespace($(element).parent().text());
    const siblingText = collectSiblingTextUntilStrong(element);
    const precedingSiblingText = collectSiblingTextSinceStrong(element);
    const compactReverseCreditMatch = precedingSiblingText.match(
      new RegExp(
        String.raw`^${MUSICIAN_ROLE_PATTERN_SOURCE}(?:\s*(?:,|\/|&|\band\b)\s*${MUSICIAN_ROLE_PATTERN_SOURCE})*\s*-$`,
        "i"
      )
    );
    const roleArtists = [
      ...parsePerformerCredit(`${markedText} ${siblingText}`),
      ...parsePerformerCredit(`${precedingSiblingText} ${markedText}`),
      ...(compactReverseCreditMatch ? splitExplicitArtistList(markedText) : []),
      ...parseParentheticalCredits(`${markedText} ${siblingText}`)
    ];

    if (roleArtists.length > 0) {
      artists.push(...roleArtists);
      return;
    }

    const markedArtists = splitExplicitArtistList(markedText);

    for (const artist of markedArtists) {
      if (TITLE_CONCEPT_PATTERN.test(artist)) {
        continue;
      }

      const artistIdentity = getArtistIdentity(context, artist);
      const isTitleRelated =
        titleCandidateIdentities.includes(artistIdentity) ||
        (artist.split(/\s+/).length <= 3 &&
          titleCandidateIdentities.some(
            (identity) => artistIdentity.startsWith(`${identity}-`)
          ));
      const hasPerformanceContext =
        PERFORMANCE_CONTEXT_PATTERN.test(parentText) &&
        (/\bstarring\b/i.test(parentText) ||
          !REPERTOIRE_OR_REFERENCE_CONTEXT_PATTERN.test(parentText));
      const isStandaloneDescriptionSubject =
        markedArtists.length === 1 &&
        isDescriptionSubject(artist, context);
      const isAmbiguousSingleName = /^\p{Lu}\p{Ll}+$/u.test(artist);

      if (
        !isAmbiguousSingleName &&
        (isTitleRelated || hasPerformanceContext || isStandaloneDescriptionSubject) &&
        !isTributeOrRepertoireSubject(title, artist) &&
        !isMemorialSubject(artist, context)
      ) {
        artists.push(artist);
      }
    }
  });

  return artists;
}

function isExplicitTitleBilling(title: string, artist: string): boolean {
  const normalizedArtist = normalizeWhitespace(artist).toLowerCase();
  const suffixes = normalizeWhitespace(title)
    .split(/\s+(?:with|feat\.?|ft\.?)\s+|\bpresented by\s+|\s+[-–—]\s+/i)
    .slice(1)
    .map((suffix) => suffix.toLowerCase());

  return suffixes.some((suffix) => suffix.includes(normalizedArtist));
}

function isMemorialSubject(
  artist: string,
  context: EllingtonDescriptionContext
): boolean {
  const escapedArtist = artist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return (
    new RegExp(
      String.raw`\b(?:late|memory of|tribute to)\s+(?:the\s+)?${escapedArtist}\b`,
      "i"
    ).test(context.plainText) ||
    new RegExp(
      String.raw`\bpassing\b.{0,120}\b${escapedArtist}\b|\b${escapedArtist}\b.{0,120}\bpassing\b|\blegacy of\s+(?:the\s+)?${escapedArtist}\b|\b${escapedArtist}(?:['’]s)?\s+legacy\b`,
      "i"
    ).test(context.plainText)
  );
}

function getTitleCandidates(title: string): string[] {
  const normalized = normalizeWhitespace(title)
    .replace(/^\[\s*((?:[A-Z]\s+)+[A-Z])\s*\]/, (_, letters: string) =>
      letters.replace(/\s+/g, "")
    )
    .replace(TITLE_LOCATION_SUFFIX_PATTERN, "")
    .replace(/^\[\s*|\s*\]$/g, "");
  const albumLaunchMatch = normalized.match(/^(.+?)\s+album launch\b/i);

  if (albumLaunchMatch?.[1]) {
    return splitExplicitArtistList(albumLaunchMatch[1]);
  }
  const locationMatch = normalized.match(
    /^(.+?)\s+\((?:MEL|NL|NSW|PARIS|QLD|USA)\)(?:\s+.+)?$/i
  );

  if (locationMatch?.[1]) {
    return splitExplicitArtistList(locationMatch[1]);
  }

  const quotedPresentsMatch = normalized.match(
    /^(.+?)\s+presents?\s+[“"](.+?)[”"](?:\s+-\s+.+)?$/i
  );

  if (quotedPresentsMatch?.[1] && quotedPresentsMatch[2]) {
    return [quotedPresentsMatch[2], quotedPresentsMatch[1]].flatMap(
      splitExplicitArtistList
    );
  }

  const presentedByMatch = normalized.match(/\bpresented by\s+(.+?)$/i);

  if (presentedByMatch?.[1]) {
    const titlePrefix = normalizeEllingtonArtistName(
      normalized.split(/:\s+|\s+[-–—]\s+/)[0]
    );

    return [
      titlePrefix,
      ...(NON_ARTIST_PRESENTER_PATTERN.test(presentedByMatch[1])
        ? []
        : [presentedByMatch[1]])
    ].flatMap(splitExplicitArtistList);
  }

  const presentsMatch = normalized.match(/^(.+?)\s+presents?:?\s+(.+)$/i);

  if (presentsMatch?.[1] && presentsMatch[2]) {
    const presenter = normalizeEllingtonArtistName(presentsMatch[1]);
    const presented = normalizeEllingtonArtistName(
      presentsMatch[2].split(/\s+[-–—]\s+/)[0]
    );

    if (/^WAYJO$/i.test(presenter)) {
      return splitExplicitArtistList(presented);
    }

    return [presented, presenter].flatMap(splitExplicitArtistList);
  }

  const featureMatch = normalized.match(/^(.+?)(?:\s+[-–—])?\s+(?:feat\.?|ft\.?)\s+(.+)$/i);

  if (featureMatch?.[1] && featureMatch[2]) {
    const featuredBilling = featureMatch[2].split(
      /\s+[-–—]\s+with\s+/i
    );

    return [featureMatch[1], ...featuredBilling].flatMap(splitExplicitArtistList);
  }

  const withMatch = normalized.match(/^(.+?)\s+with\s+(.+)$/i);

  if (withMatch?.[2] && TITLE_CONCEPT_PATTERN.test(withMatch[1])) {
    return splitExplicitArtistList(withMatch[2]);
  }

  const titleSegments = normalized.split(/\s+[-–—]\s+/);
  const titlePrefix = titleSegments[0] ?? normalized;
  const explicitLaterSegment = titleSegments
    .slice(1)
    .map((segment) => segment.split(/:\s+/)[0])
    .filter((segment) => !/^[“”‘’"']|[“”‘’"']$/.test(segment.trim()))
    .find(
      () =>
        TITLE_CONCEPT_PATTERN.test(titlePrefix) &&
        !/^This is Jazz!?$/i.test(titlePrefix)
    );

  if (explicitLaterSegment) {
    return splitExplicitArtistList(explicitLaterSegment);
  }

  const commaMatch = normalized.match(/^([^,]{2,40}),\s+.+$/);
  const candidate = normalizeEllingtonArtistName(
    commaMatch?.[1] ?? normalized.split(/\s+[-–—]\s+|:\s+/)[0]
  );

  return splitExplicitArtistList(candidate);
}

function isDescriptionSubject(
  artist: string,
  context: EllingtonDescriptionContext
): boolean {
  const artistIdentity = getArtistIdentity(context, artist);

  if (!artistIdentity) {
    return false;
  }

  return context.lines
    .filter((line) => !/^(?:doors?|show|artist talk)\b/i.test(line))
    .some((line) => {
      const lineIdentity = getArtistIdentity(context, line);

      return (
        lineIdentity.startsWith(`${artistIdentity}-`) ||
        lineIdentity.includes(`-${artistIdentity}-are-`) ||
        lineIdentity.includes(`-${artistIdentity}-is-`) ||
        lineIdentity.includes(`-${artistIdentity}-returns-`) ||
        lineIdentity.includes(`-energy-of-${artistIdentity}-`) ||
        lineIdentity.includes(`-band-${artistIdentity}-featuring-`)
      );
    });
}

function extractCorroboratedTitleArtists(
  title: string,
  context: EllingtonDescriptionContext,
  markedArtists: string[]
): string[] {
  const markedIdentities = markedArtists.map((artist) =>
    getArtistIdentity(context, artist)
  );
  return getTitleCandidates(title).filter((candidate) => {
    if (!candidate || TITLE_CONCEPT_PATTERN.test(candidate) || !isLikelyArtistName(candidate)) {
      return false;
    }

    const candidateIdentity = getArtistIdentity(context, candidate);
    const isMarked = markedIdentities.includes(candidateIdentity);
    const hasExpandedMarkedName = markedIdentities.some(
      (identity) => identity.startsWith(`${candidateIdentity}-`)
    );

    return (
      !isMemorialSubject(candidate, context) &&
      !hasExpandedMarkedName &&
      (isMarked ||
        isDescriptionSubject(candidate, context) ||
        isExplicitTitleBilling(title, candidate))
    );
  });
}

function isSimpleCreditedTitleArtist(
  title: string,
  candidate: string,
  creditedArtists: string[],
  context: EllingtonDescriptionContext
): boolean {
  if (
    /\b(?:feat\.?|ft\.?|presented by|presents?|with)\b/i.test(title) ||
    candidate.includes("/") ||
    NON_ARTIST_PRESENTER_PATTERN.test(candidate)
  ) {
    return false;
  }

  const normalizedTitle = normalizeWhitespace(title)
    .replace(/^\[\s*((?:[A-Z]\s+)+[A-Z])\s*\]/, (_, letters: string) =>
      letters.replace(/\s+/g, "")
    )
    .replace(TITLE_LOCATION_SUFFIX_PATTERN, "")
    .replace(/^\[\s*|\s*\]$/g, "");
  const leadTitle = normalizeEllingtonArtistName(
    normalizedTitle.split(/\s+[-–—]\s+|:\s+/)[0] ?? normalizedTitle
  );
  const candidateIdentity = getArtistIdentity(context, candidate);

  if (getArtistIdentity(context, leadTitle) !== candidateIdentity) {
    return false;
  }

  return !creditedArtists.some((artist) =>
    getArtistIdentity(context, artist).startsWith(`${candidateIdentity}-`)
  );
}

export function extractEllingtonArtists(input: {
  title: string;
  contentHtml: string | null | undefined;
}) {
  const contentHtml = input.contentHtml ?? "";

  if (!contentHtml) {
    return createArtistExtraction([], "explicit_lineup");
  }

  const context = createEllingtonDescriptionContext(contentHtml);
  const markedArtists = extractMarkedArtists(input.title, context);
  const lineArtists = context.lines.flatMap(parsePerformerCredit);
  const creditedArtists = [...markedArtists, ...lineArtists];
  const formationArtists = extractFormationArtists(context);
  const ensembleLeaderArtists = extractNamedEnsembleLeader(
    input.title,
    context,
    creditedArtists
  );
  const corroboratedTitleArtists = extractCorroboratedTitleArtists(
    input.title,
    context,
    markedArtists
  );
  const creditedTitleArtists = getTitleCandidates(input.title).filter(
    (candidate) =>
      creditedArtists.length >= 2 &&
      !TITLE_CONCEPT_PATTERN.test(candidate) &&
      isLikelyArtistName(candidate) &&
      !isMemorialSubject(candidate, context) &&
      (ENSEMBLE_SUFFIX_PATTERN.test(candidate) ||
        isSimpleCreditedTitleArtist(input.title, candidate, creditedArtists, context))
  );

  return createArtistExtraction(
    [
      ...creditedTitleArtists,
      ...corroboratedTitleArtists,
      ...ensembleLeaderArtists,
      ...lineArtists,
      ...markedArtists,
      ...formationArtists
    ],
    "explicit_lineup"
  );
}
