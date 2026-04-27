function normalizeArtistComparisonText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function formatGigCardArtists(
  title: string,
  artistNames: string[]
): string | null {
  const normalizedTitle = normalizeArtistComparisonText(title);
  const displayNames: string[] = [];
  const seen = new Set<string>();

  for (const artistName of artistNames) {
    const trimmedName = artistName.trim();

    if (!trimmedName) {
      continue;
    }

    const normalizedArtistName = normalizeArtistComparisonText(trimmedName);

    if (!normalizedArtistName || normalizedArtistName === normalizedTitle) {
      continue;
    }

    if (seen.has(normalizedArtistName)) {
      continue;
    }

    seen.add(normalizedArtistName);
    displayNames.push(trimmedName);
  }

  if (displayNames.length === 0) {
    return null;
  }

  return displayNames.join(" | ");
}
