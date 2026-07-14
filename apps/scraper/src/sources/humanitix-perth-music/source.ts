import type { NormalizedGig } from "@perth-gig-finder/shared";

import type { SourceAdapter, SourceAdapterResult } from "../../types";
import {
  normalizeHumanitixDetailPage,
  parseHumanitixDiscoveryPage,
  repairHumanitixArtists
} from "./parser";

const SOURCE_ORIGIN = "https://humanitix.com";
const SOURCE_URL = `${SOURCE_ORIGIN}/au/events/au--wa--perth/music`;
const DISCOVERY_URLS = [
  SOURCE_URL,
  `${SOURCE_ORIGIN}/au/events/au--wa--perth/trending--music`
];
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_DISCOVERY_PAGES = 12;
const DETAIL_FETCH_BATCH_SIZE = 8;

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetchImpl(input, {
      headers: {
        accept: "text/html,application/xhtml+xml"
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Humanitix request timed out: ${input}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const humanitixPerthMusicSource: SourceAdapter = {
  slug: "humanitix-perth-music",
  name: "Humanitix Perth Music",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch): Promise<SourceAdapterResult> {
    const seenDiscoveryUrls = new Set<string>();
    const queuedDiscoveryUrls = [...DISCOVERY_URLS];
    const seenEventUrls = new Set<string>();
    const gigs: NormalizedGig[] = [];
    let failedCount = 0;

    while (
      queuedDiscoveryUrls.length > 0 &&
      seenDiscoveryUrls.size < MAX_DISCOVERY_PAGES
    ) {
      const discoveryUrl = queuedDiscoveryUrls.shift();

      if (!discoveryUrl || seenDiscoveryUrls.has(discoveryUrl)) {
        continue;
      }

      seenDiscoveryUrls.add(discoveryUrl);

      try {
        const response = await fetchWithTimeout(fetchImpl, discoveryUrl);

        if (!response.ok) {
          throw new Error(
            `Humanitix discovery page returned status ${response.status}: ${discoveryUrl}`
          );
        }

        const parsed = parseHumanitixDiscoveryPage(await response.text());
        failedCount += parsed.failedCount;

        for (const eventUrl of parsed.eventUrls) {
          seenEventUrls.add(eventUrl);
        }

        for (const nextPageUrl of parsed.nextPageUrls) {
          if (!seenDiscoveryUrls.has(nextPageUrl)) {
            queuedDiscoveryUrls.push(nextPageUrl);
          }
        }
      } catch {
        failedCount += 1;
      }
    }

    const eventUrls = [...seenEventUrls];

    for (
      let detailIndex = 0;
      detailIndex < eventUrls.length;
      detailIndex += DETAIL_FETCH_BATCH_SIZE
    ) {
      const batchResults = await Promise.all(
        eventUrls
          .slice(detailIndex, detailIndex + DETAIL_FETCH_BATCH_SIZE)
          .map(async (eventUrl) => {
            try {
              const response = await fetchWithTimeout(fetchImpl, eventUrl);

              if (!response.ok) {
                throw new Error(
                  `Humanitix event page returned status ${response.status}: ${eventUrl}`
                );
              }

              return {
                gigs: normalizeHumanitixDetailPage({
                  html: await response.text(),
                  eventUrl
                }),
                failedCount: 0
              };
            } catch {
              return {
                gigs: [],
                failedCount: 1
              };
            }
          })
      );

      for (const result of batchResults) {
        gigs.push(...result.gigs);
        failedCount += result.failedCount;
      }
    }

    return {
      gigs,
      failedCount
    };
  },
  repairArtists: repairHumanitixArtists
};
