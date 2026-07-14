import { normalizeWhitespace, slugify } from "@perth-gig-finder/shared";

import {
  createArtistExtraction,
  unknownArtistExtraction
} from "../../artist-utils";

export function parseTheBirdFeaturingArtists(
  value: string | null | undefined,
  title: string
): string[] {
  const normalized = normalizeWhitespace(value ?? "");

  if (!normalized || /^presented by\b/i.test(normalized)) {
    return [];
  }

  const artists = normalized
    .split(",")
    .map((artist) => normalizeWhitespace(artist))
    .filter(Boolean);
  const uniqueBySlug = new Map<string, string>();

  for (const artist of artists) {
    const artistSlug = slugify(artist);

    if (!artistSlug || artistSlug === slugify(title) || uniqueBySlug.has(artistSlug)) {
      continue;
    }

    uniqueBySlug.set(artistSlug, artist);
  }

  return createArtistExtraction([...uniqueBySlug.values()], "explicit_lineup").artists;
}

export function parseTheBirdInfoArtists(
  value: string | null | undefined,
  title: string
): string[] {
  const info = value ?? "";
  const candidates: string[] = [];
  const headlinerMatch = info.match(
    /\bheadlined by\s+[^,.\n]{1,100}?\baka\s+([^,.\n]{2,80})/i
  );

  if (headlinerMatch?.[1]) {
    candidates.push(normalizeWhitespace(headlinerMatch[1]));
  }

  const featuringMatch = info.match(/\bfeaturing\s*:\s*([\s\S]+)$/i);

  if (featuringMatch?.[1]) {
    for (const rawLine of featuringMatch[1].split(/\n+/)) {
      const artist = normalizeWhitespace(rawLine)
        .replace(/^&\s*/, "")
        .replace(/,?\s+on the 1s and 2s\b.*$/i, "")
        .replace(/,\s+bringing\b.*$/i, "")
        .replace(/,+$/, "")
        .trim();

      if (artist && artist !== "&" && artist.length <= 80 && !/[.!?]$/.test(artist)) {
        candidates.push(artist);
      }
    }
  }

  return parseTheBirdFeaturingArtists(candidates.join(", "), title);
}

export function repairTheBirdArtists(rawPayload: unknown) {
  const payload =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? (rawPayload as {
          mergedWeeklyFeed?: {
            Featuring?: string;
            Title?: string;
          };
          Featuring?: string;
          Info?: string;
          Title?: string;
          "Event Title"?: string;
        })
      : {};
  const weeklyTitle = normalizeWhitespace(payload.mergedWeeklyFeed?.Title ?? "");

  if (payload.mergedWeeklyFeed) {
    return createArtistExtraction(
      parseTheBirdFeaturingArtists(
        payload.mergedWeeklyFeed.Featuring,
        weeklyTitle ||
          normalizeWhitespace(payload["Event Title"] ?? payload.Title ?? "")
      ),
      "explicit_lineup"
    );
  }

  const title = normalizeWhitespace(payload.Title ?? payload["Event Title"] ?? "");
  const artists = [
    ...parseTheBirdFeaturingArtists(payload.Featuring, title),
    ...parseTheBirdInfoArtists(payload.Info, title)
  ];

  return artists.length > 0
    ? createArtistExtraction(artists, "explicit_lineup")
    : unknownArtistExtraction();
}
