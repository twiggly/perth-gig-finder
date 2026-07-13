import {
  normalizeWhitespace,
  slugify,
  type ArtistExtractionKind
} from "@perth-gig-finder/shared";

export interface ArtistExtractionResult {
  artists: string[];
  artistExtractionKind: ArtistExtractionKind;
}

export interface CanonicalArtistCandidate {
  artists: string[];
  artistExtractionKind: ArtistExtractionKind;
  priority: number;
  lastSeenAt: string;
}

const ARTIST_EXTRACTION_KIND_RANK: Record<ArtistExtractionKind, number> = {
  structured: 3,
  explicit_lineup: 2,
  parsed_text: 1,
  unknown: 0
};

const LEADING_ARTIST_DECORATION = /^[`"'“”‘’•·●▪▫◆◇★☆*~_=|:;,./\\-]+/u;
const TRAILING_ARTIST_DECORATION = /[`"'“”‘’•·●▪▫◆◇★☆*~_=|:;,./\\-]+$/u;
const PLACEHOLDER_ARTIST_PATTERN =
  /^(?:competition\s+winners?\s*(?:tba|tbc|to be announced)?|(?:(?:local|more|additional|specials?)\s+)*(?:guests?|supports?|support acts?|acts?|artists?)\s*(?:to be announced|tba|tbc)?|(?:secret|mystery)\s+(?:act|artist|guest|set)s?|(?:more|more\s+(?:acts?|artists?|guests?))|(?:tba|tbc|to be announced|more\s+(?:tba|tbc|to be announced)|more to be announced))[!.]?$/i;
const TITLE_ARTIST_ENSEMBLE_SUFFIX_PATTERN =
  /^(?:jazz\s+band|quartet|quintet|trio|orchestra|ensemble|collective|choir)$/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanArtistName(artist: string): string {
  let normalizedArtist = normalizeWhitespace(artist);

  if (!normalizedArtist) {
    return "";
  }

  while (true) {
    const cleaned = normalizeWhitespace(
      normalizedArtist
        .replace(LEADING_ARTIST_DECORATION, "")
        .replace(TRAILING_ARTIST_DECORATION, "")
    );

    if (!cleaned || cleaned === normalizedArtist) {
      return cleaned || normalizedArtist;
    }

    normalizedArtist = cleaned;
  }
}

export function normalizeArtistNames(artists: string[]): string[] {
  const uniqueArtistsBySlug = new Map<string, string>();

  for (const artist of artists) {
    const normalizedArtist = cleanArtistName(artist);

    if (!normalizedArtist) {
      continue;
    }

    if (PLACEHOLDER_ARTIST_PATTERN.test(normalizedArtist)) {
      continue;
    }

    const artistSlug = slugify(normalizedArtist);

    if (!artistSlug || uniqueArtistsBySlug.has(artistSlug)) {
      continue;
    }

    uniqueArtistsBySlug.set(artistSlug, normalizedArtist);
  }

  return [...uniqueArtistsBySlug.values()];
}

function hasMixedCaseLetters(value: string): boolean {
  return value !== value.toLocaleUpperCase("en-AU") &&
    value !== value.toLocaleLowerCase("en-AU");
}

function isAllUppercaseName(value: string): boolean {
  return value === value.toLocaleUpperCase("en-AU") &&
    value !== value.toLocaleLowerCase("en-AU");
}

function isAllLowercaseName(value: string): boolean {
  return value === value.toLocaleLowerCase("en-AU") &&
    value !== value.toLocaleUpperCase("en-AU");
}

export function selectPreferredArtistDisplayName(
  existingName: string | null | undefined,
  incomingName: string
): string {
  const normalizedIncomingName = cleanArtistName(incomingName);
  const normalizedExistingName = cleanArtistName(existingName ?? "");

  if (!normalizedExistingName) {
    return normalizedIncomingName;
  }

  if (
    hasMixedCaseLetters(normalizedExistingName) &&
    isAllUppercaseName(normalizedIncomingName)
  ) {
    return normalizedExistingName;
  }

  if (
    isAllUppercaseName(normalizedExistingName) &&
    hasMixedCaseLetters(normalizedIncomingName)
  ) {
    return normalizedIncomingName;
  }

  return normalizedIncomingName;
}

export function preferArtistDisplayNamesFromTitle(
  artists: string[],
  title: string | null | undefined
): string[] {
  const normalizedTitle = normalizeWhitespace(title ?? "");

  if (!normalizedTitle) {
    return artists;
  }

  return artists.map((artist) => {
    const normalizedArtist = cleanArtistName(artist);

    if (!normalizedArtist) {
      return artist;
    }

    const artistPattern = escapeRegExp(normalizedArtist).replace(/\s+/g, "\\s+");
    const match = normalizedTitle.match(
      new RegExp(
        String.raw`(?:^|[^\p{L}\p{N}])((?:The\s+)?${artistPattern}(?:\s+(?:Jazz\s+Band|Band|Quartet|Quintet|Trio|Orchestra|Ensemble|Collective|Choir))?)(?=$|[^\p{L}\p{N}])`,
        "iu"
      )
    );
    const titleCandidate = normalizeWhitespace(match?.[1] ?? "");

    if (!titleCandidate) {
      return normalizedArtist;
    }

    const artistSlug = slugify(normalizedArtist);
    const titleCandidateSlug = slugify(titleCandidate);

    if (titleCandidateSlug === artistSlug) {
      return isAllLowercaseName(normalizedArtist)
        ? titleCandidate
        : normalizedArtist;
    }

    if (
      titleCandidateSlug === `the-${artistSlug}` &&
      titleCandidate.startsWith("The ")
    ) {
      return titleCandidate;
    }

    const suffix = normalizeWhitespace(titleCandidate.slice(normalizedArtist.length));

    return titleCandidateSlug.startsWith(`${artistSlug}-`) &&
      TITLE_ARTIST_ENSEMBLE_SUFFIX_PATTERN.test(suffix)
      ? titleCandidate
      : normalizedArtist;
  });
}

export function createArtistExtraction(
  artists: string[],
  preferredKind: Exclude<ArtistExtractionKind, "unknown">
): ArtistExtractionResult {
  const normalizedArtists = normalizeArtistNames(artists);

  if (normalizedArtists.length === 0) {
    return {
      artists: [],
      artistExtractionKind: "unknown"
    };
  }

  return {
    artists: normalizedArtists,
    artistExtractionKind: preferredKind
  };
}

export function unknownArtistExtraction(): ArtistExtractionResult {
  return {
    artists: [],
    artistExtractionKind: "unknown"
  };
}

export function getArtistExtractionKindRank(kind: ArtistExtractionKind): number {
  return ARTIST_EXTRACTION_KIND_RANK[kind];
}

export function hasKnownArtists(extraction: ArtistExtractionResult): boolean {
  return extraction.artistExtractionKind !== "unknown" && extraction.artists.length > 0;
}

export function selectCanonicalArtistNames(
  candidates: CanonicalArtistCandidate[]
): string[] {
  const normalizedCandidates = candidates
    .map((candidate) => ({
      ...candidate,
      artists: normalizeArtistNames(candidate.artists)
    }))
    .filter(
      (candidate) =>
        candidate.artistExtractionKind !== "unknown" && candidate.artists.length > 0
    )
    .sort((left, right) => {
      const kindDifference =
        getArtistExtractionKindRank(right.artistExtractionKind) -
        getArtistExtractionKindRank(left.artistExtractionKind);

      if (kindDifference !== 0) {
        return kindDifference;
      }

      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }

      if (right.artists.length !== left.artists.length) {
        return right.artists.length - left.artists.length;
      }

      return right.lastSeenAt.localeCompare(left.lastSeenAt);
    });

  return normalizedCandidates[0]?.artists ?? [];
}
