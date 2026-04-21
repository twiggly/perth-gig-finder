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

export function normalizeArtistNames(artists: string[]): string[] {
  const uniqueArtistsBySlug = new Map<string, string>();

  for (const artist of artists) {
    const normalizedArtist = normalizeWhitespace(artist);

    if (!normalizedArtist) {
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
