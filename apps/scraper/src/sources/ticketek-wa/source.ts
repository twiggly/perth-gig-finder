import type { SourceAdapter, SourceAdapterResult } from "../../types";
import {
  buildTicketekSearchUrl,
  choosePreferredListing,
  createTicketekCookieJar,
  detectFrontdoorPage,
  enrichTicketekListingWithExactTime,
  fetchTicketekPageHtml,
  hydrateTicketekSearchApiLookup,
  normalizeTicketekListing,
  parseTicketekSearchPage,
  repairTicketekArtists,
  runTicketekTitleHydrationBatch
} from "./parser";
import type { TicketekSearchListing } from "./types";

const SOURCE_URL = "https://premier.ticketek.com.au/search/SearchResults.aspx";
const MAX_PAGES_PER_QUERY = 3;
const SEARCH_QUERIES = [
  "concerts perth",
  "music perth",
  "live music perth",
  "orchestra perth",
  "band perth",
  "festival perth",
  "rock perth"
];

export const ticketekWaSource: SourceAdapter = {
  slug: "ticketek-wa",
  name: "Ticketek WA",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch): Promise<SourceAdapterResult> {
    const cookieJar = createTicketekCookieJar();
    const listingsById = new Map<string, TicketekSearchListing>();
    const exactTimeLookup = new Map<string, string | null>();
    const titleQueryCache = new Set<string>();
    let failedCount = 0;
    const searchApiTasks = SEARCH_QUERIES.map(async (query) => {
      try {
        await hydrateTicketekSearchApiLookup(query, exactTimeLookup, fetchImpl);
      } catch {
        // Keep the source usable with date-only fallbacks if the structured API is unavailable.
      }
    });

    for (const query of SEARCH_QUERIES) {
      try {
        const firstPageHtml = await fetchTicketekPageHtml(
          buildTicketekSearchUrl(query, 1),
          fetchImpl,
          cookieJar
        );

        if (detectFrontdoorPage(firstPageHtml)) {
          failedCount += 1;
          continue;
        }

        const firstPage = parseTicketekSearchPage(firstPageHtml, query);
        failedCount += firstPage.failedCount;

        for (const listing of firstPage.listings) {
          const existing = listingsById.get(listing.externalId);
          listingsById.set(
            listing.externalId,
            existing ? choosePreferredListing(existing, listing) : listing
          );
        }

        const totalPages = Math.min(MAX_PAGES_PER_QUERY, firstPage.totalPages);

        for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
          const pageHtml = await fetchTicketekPageHtml(
            buildTicketekSearchUrl(query, pageNumber),
            fetchImpl,
            cookieJar
          );

          if (detectFrontdoorPage(pageHtml)) {
            failedCount += 1;
            break;
          }

          const pageResult = parseTicketekSearchPage(pageHtml, query);
          failedCount += pageResult.failedCount;

          for (const listing of pageResult.listings) {
            const existing = listingsById.get(listing.externalId);
            listingsById.set(
              listing.externalId,
              existing ? choosePreferredListing(existing, listing) : listing
            );
          }
        }
      } catch {
        failedCount += 1;
      }
    }

    await Promise.all(searchApiTasks);

    const listings = [...listingsById.values()];
    const listingsNeedingTitleHydration = listings.filter(
      (listing) =>
        enrichTicketekListingWithExactTime(listing, exactTimeLookup)
          .startsAtPrecision !== "exact"
    );

    await runTicketekTitleHydrationBatch({
      listings: listingsNeedingTitleHydration,
      exactTimeLookup,
      fetchImpl,
      titleQueryCache
    });

    const enrichedListings = listings.map((listing) =>
      enrichTicketekListingWithExactTime(listing, exactTimeLookup)
    );

    const gigs = enrichedListings
      .map((listing) => normalizeTicketekListing(listing))
      .sort((left, right) =>
        left.startsAt === right.startsAt
          ? left.title.localeCompare(right.title)
          : left.startsAt.localeCompare(right.startsAt)
      );

    return { gigs, failedCount };
  },
  repairArtists: repairTicketekArtists
};
