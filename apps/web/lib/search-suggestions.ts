import { normalizeSearchText } from "./homepage-filters";
import { getHomepageLowerBound } from "./homepage-dates";
import { createSupabaseServerClient } from "./supabase";
import {
  listVenueSuggestions,
  type VenueOption
} from "./venues";
import type { AutocompleteSuggestion } from "./search-suggestion-types";

const MAX_AUTOCOMPLETE_SUGGESTIONS = 7;
const MAX_GIG_ROWS = 120;

interface GigSuggestionRecord {
  title: string;
  artist_names: string[];
  venue_name: string;
  venue_slug: string;
  venue_suburb: string | null;
}

interface SearchSuggestionFilters {
  query: string;
  venueSlugs: string[];
}

interface RankedSuggestion {
  score: number;
  suggestion: AutocompleteSuggestion;
}

function getMatchScore(text: string, query: string): number {
  const normalizedText = normalizeSearchText(text);
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedText || !normalizedQuery) {
    return Number.POSITIVE_INFINITY;
  }

  if (normalizedText.startsWith(normalizedQuery)) {
    return 0;
  }

  const words = normalizedText.split(" ");
  if (words.some((word) => word.startsWith(normalizedQuery))) {
    return 1;
  }

  if (normalizedText.includes(normalizedQuery)) {
    return 2;
  }

  const tokens = normalizedQuery.split(" ");
  if (tokens.every((token) => normalizedText.includes(token))) {
    return 3;
  }

  return Number.POSITIVE_INFINITY;
}

function getVenueSummary(venueName: string, venueSuburb: string | null): string {
  return venueSuburb ? `${venueName} · ${venueSuburb}` : venueName;
}

function typeOrder(type: AutocompleteSuggestion["type"]): number {
  if (type === "gig") {
    return 0;
  }

  if (type === "artist") {
    return 1;
  }

  return 2;
}

export function buildAutocompleteSuggestions(
  query: string,
  gigs: GigSuggestionRecord[],
  venues: VenueOption[]
): AutocompleteSuggestion[] {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return [];
  }

  const gigMap = new Map<string, RankedSuggestion>();
  const artistMap = new Map<string, RankedSuggestion>();
  const venueMap = new Map<string, RankedSuggestion>();

  for (const gig of gigs) {
    const gigScore = getMatchScore(gig.title, normalizedQuery);
    const gigKey = normalizeSearchText(gig.title);

    if (Number.isFinite(gigScore) && !gigMap.has(gigKey)) {
      gigMap.set(gigKey, {
        score: gigScore,
        suggestion: {
          type: "gig",
          label: gig.title,
          query: gig.title,
          subtext: getVenueSummary(gig.venue_name, gig.venue_suburb),
          icon: "gig"
        }
      });
    }

    for (const artistName of gig.artist_names) {
      const artistScore = getMatchScore(artistName, normalizedQuery);
      const artistKey = normalizeSearchText(artistName);

      if (!Number.isFinite(artistScore)) {
        continue;
      }

      const existingSuggestion = artistMap.get(artistKey);

      if (!existingSuggestion || artistScore < existingSuggestion.score) {
        artistMap.set(artistKey, {
          score: artistScore,
          suggestion: {
            type: "artist",
            label: artistName,
            query: artistName,
            subtext: getVenueSummary(gig.venue_name, gig.venue_suburb),
            icon: "artist"
          }
        });
      }
    }
  }

  for (const venue of venues) {
    const venueScore = Math.min(
      getMatchScore(venue.name, normalizedQuery),
      getMatchScore(venue.suburb ?? "", normalizedQuery)
    );

    if (!Number.isFinite(venueScore)) {
      continue;
    }

    venueMap.set(venue.slug, {
      score: venueScore,
      suggestion: {
        type: "venue",
        label: venue.name,
        slug: venue.slug,
        subtext: venue.suburb,
        icon: "venue"
      }
    });
  }

  return [...gigMap.values(), ...artistMap.values(), ...venueMap.values()]
    .sort((left, right) => {
      if (left.score !== right.score) {
        return left.score - right.score;
      }

      const leftTypeOrder = typeOrder(left.suggestion.type);
      const rightTypeOrder = typeOrder(right.suggestion.type);
      if (leftTypeOrder !== rightTypeOrder) {
        return leftTypeOrder - rightTypeOrder;
      }

      return left.suggestion.label.localeCompare(right.suggestion.label, "en-AU");
    })
    .slice(0, MAX_AUTOCOMPLETE_SUGGESTIONS)
    .map(({ suggestion }) => suggestion);
}

export async function listSearchSuggestions({
  query,
  venueSlugs
}: SearchSuggestionFilters): Promise<AutocompleteSuggestion[]> {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return [];
  }

  const client = createSupabaseServerClient();
  const lowerBound = getHomepageLowerBound(new Date());
  let gigQuery = client
    .from("gig_cards")
    .select("title, artist_names, venue_name, venue_slug, venue_suburb")
    .eq("status", "active")
    .gte("starts_at", lowerBound.toISOString())
    .order("starts_at", { ascending: true })
    .limit(MAX_GIG_ROWS);

  if (venueSlugs.length > 0) {
    gigQuery = gigQuery.in("venue_slug", venueSlugs);
  }

  const [gigResult, venues] = await Promise.all([
    gigQuery,
    listVenueSuggestions(query, venueSlugs)
  ]);

  if (gigResult.error) {
    throw new Error(gigResult.error.message);
  }

  const gigs = ((gigResult.data ?? []) as Array<GigSuggestionRecord & { artist_names: string[] | null }>)
    .map((gig) => ({
      ...gig,
      artist_names: gig.artist_names ?? []
    }));

  return buildAutocompleteSuggestions(query, gigs, venues);
}
