import type { NormalizedGig } from "@perth-gig-finder/shared";

import type { SourceAdapter } from "../../types";
import {
  buildMoshtixWaSearchUrl,
  normalizeMoshtixEventPage,
  parseMoshtixSearchPage,
  repairMoshtixArtists,
  shouldSkipSearchListingBeforeDetailFetch,
  SkipMoshtixListingError
} from "./parser";
import type {
  MoshtixListingFetchResult,
  MoshtixSearchListing,
  ParsedMoshtixSearchPage
} from "./types";

const SOURCE_URL = "https://www.moshtix.com.au/v2/search";
const REQUEST_TIMEOUT_MS = 10_000;
const DETAIL_FETCH_BATCH_SIZE = 12;

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetchImpl(input, {
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Moshtix request timed out: ${input}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSearchPage(
  fetchImpl: typeof fetch,
  page: number,
  now: Date
): Promise<ParsedMoshtixSearchPage> {
  const response = await fetchWithTimeout(
    fetchImpl,
    buildMoshtixWaSearchUrl(now, page)
  );

  if (!response.ok) {
    throw new Error(
      `Moshtix WA search returned status ${response.status} for page ${page}`
    );
  }

  return parseMoshtixSearchPage(await response.text());
}

async function fetchMoshtixListingDetails(
  fetchImpl: typeof fetch,
  listing: MoshtixSearchListing
): Promise<MoshtixListingFetchResult> {
  try {
    const response = await fetchWithTimeout(fetchImpl, listing.eventUrl);

    if (!response.ok) {
      return {
        gig: null,
        failedCount: 1
      };
    }

    return {
      gig: normalizeMoshtixEventPage({
        listing,
        html: await response.text()
      }),
      failedCount: 0
    };
  } catch (error) {
    if (error instanceof SkipMoshtixListingError) {
      return {
        gig: null,
        failedCount: 0
      };
    }

    return {
      gig: null,
      failedCount: 1
    };
  }
}

export const moshtixWaSource: SourceAdapter = {
  slug: "moshtix-wa",
  name: "Moshtix WA",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch) {
    const gigs: NormalizedGig[] = [];
    const seenEventIds = new Set<string>();
    const now = new Date();
    let failedCount = 0;
    let currentPage = 1;
    let totalPages = 1;

    while (currentPage <= totalPages) {
      const searchPage = await fetchSearchPage(fetchImpl, currentPage, now);
      totalPages = Math.max(totalPages, searchPage.totalPages);
      failedCount += searchPage.failedCount;
      const detailListings: MoshtixSearchListing[] = [];

      for (const listing of searchPage.listings) {
        if (seenEventIds.has(listing.externalId)) {
          continue;
        }

        seenEventIds.add(listing.externalId);

        if (shouldSkipSearchListingBeforeDetailFetch(listing)) {
          continue;
        }

        detailListings.push(listing);
      }

      for (
        let detailIndex = 0;
        detailIndex < detailListings.length;
        detailIndex += DETAIL_FETCH_BATCH_SIZE
      ) {
        const batch = detailListings.slice(
          detailIndex,
          detailIndex + DETAIL_FETCH_BATCH_SIZE
        );
        const batchResults = await Promise.all(
          batch.map((listing) => fetchMoshtixListingDetails(fetchImpl, listing))
        );

        for (const result of batchResults) {
          failedCount += result.failedCount;

          if (result.gig) {
            gigs.push(result.gig);
          }
        }
      }

      currentPage += 1;
    }

    return {
      gigs,
      failedCount
    };
  },
  repairArtists: repairMoshtixArtists
};
