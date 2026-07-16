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
  runTicketekStructuredMusicVerificationBatch,
  runTicketekTitleHydrationBatch
} from "./parser";
import type { TicketekSearchListing } from "./types";

const SOURCE_URL = "https://premier.ticketek.com.au/search/SearchResults.aspx";
const MAX_PAGES_PER_QUERY = 3;
const SEARCH_QUERIES = [
  { query: "concerts perth", verifyUnclassified: false },
  { query: "music perth", verifyUnclassified: false },
  { query: "live music perth", verifyUnclassified: false },
  { query: "orchestra perth", verifyUnclassified: false },
  { query: "band perth", verifyUnclassified: false },
  { query: "festival perth", verifyUnclassified: false },
  { query: "rock perth", verifyUnclassified: false },
  { query: "Astor Theatre", verifyUnclassified: true }
];

export const ticketekWaSource: SourceAdapter = {
  slug: "ticketek-wa",
  name: "Ticketek WA",
  baseUrl: SOURCE_URL,
  priority: 10,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch, context): Promise<SourceAdapterResult> {
    const cookieJar = createTicketekCookieJar();
    const listingsById = new Map<string, TicketekSearchListing>();
    const unclassifiedListingsById = new Map<string, TicketekSearchListing>();
    const exactTimeLookup = new Map<string, string | null>();
    const titleQueryCache = new Set<string>();
    let failedCount = 0;
    const searchApiTasks = SEARCH_QUERIES.map(async ({ query }) => {
      try {
        await hydrateTicketekSearchApiLookup(query, exactTimeLookup, fetchImpl);
      } catch {
        // Keep the source usable with date-only fallbacks if the structured API is unavailable.
      }
    });

    for (const [queryIndex, queryConfig] of SEARCH_QUERIES.entries()) {
      const { query, verifyUnclassified } = queryConfig;
      const listingCountBeforeQuery = listingsById.size;
      const queryListingIds = new Set<string>();
      let fetchedPageCount = 0;

      const mergeParsedPage = (page: ReturnType<typeof parseTicketekSearchPage>) => {
        failedCount += page.failedCount;

        for (const listing of page.listings) {
          queryListingIds.add(listing.externalId);
          unclassifiedListingsById.delete(listing.externalId);
          const existing = listingsById.get(listing.externalId);
          listingsById.set(
            listing.externalId,
            existing ? choosePreferredListing(existing, listing) : listing
          );
        }

        if (!verifyUnclassified) {
          return;
        }

        for (const listing of page.unclassifiedListings) {
          if (listingsById.has(listing.externalId)) {
            continue;
          }

          const existing = unclassifiedListingsById.get(listing.externalId);
          unclassifiedListingsById.set(
            listing.externalId,
            existing ? choosePreferredListing(existing, listing) : listing
          );
        }
      };

      try {
        const firstPageHtml = await fetchTicketekPageHtml(
          buildTicketekSearchUrl(query, 1),
          fetchImpl,
          cookieJar
        );
        fetchedPageCount += 1;

        if (detectFrontdoorPage(firstPageHtml)) {
          failedCount += 1;
          continue;
        }

        const firstPage = parseTicketekSearchPage(firstPageHtml, query);
        mergeParsedPage(firstPage);

        const totalPages = Math.min(MAX_PAGES_PER_QUERY, firstPage.totalPages);

        for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
          const pageHtml = await fetchTicketekPageHtml(
            buildTicketekSearchUrl(query, pageNumber),
            fetchImpl,
            cookieJar
          );
          fetchedPageCount += 1;

          if (detectFrontdoorPage(pageHtml)) {
            failedCount += 1;
            break;
          }

          const pageResult = parseTicketekSearchPage(pageHtml, query);
          mergeParsedPage(pageResult);
        }
      } catch {
        failedCount += 1;
      }

      const metricPrefix = `ticketek.html_query_${queryIndex + 1}`;
      context?.recordMetric?.(`${metricPrefix}.pages`, fetchedPageCount);
      context?.recordMetric?.(
        `${metricPrefix}.candidates`,
        queryListingIds.size
      );
      context?.recordMetric?.(
        `${metricPrefix}.new_unique`,
        Math.max(0, listingsById.size - listingCountBeforeQuery)
      );
    }

    await Promise.all(searchApiTasks);
    context?.recordMetric?.(
      "ticketek.search_api.exact_time_keys",
      exactTimeLookup.size
    );

    const unclassifiedListings = [...unclassifiedListingsById.values()].filter(
      (listing) => !listingsById.has(listing.externalId)
    );
    const structuredVerification = await runTicketekStructuredMusicVerificationBatch({
      listings: unclassifiedListings,
      exactTimeLookup,
      fetchImpl,
      titleQueryCache
    });

    for (const listing of structuredVerification.acceptedListings) {
      const existing = listingsById.get(listing.externalId);
      listingsById.set(
        listing.externalId,
        existing ? choosePreferredListing(existing, listing) : listing
      );
    }

    context?.recordMetric?.(
      "ticketek.structured_music.candidates",
      unclassifiedListings.length
    );
    context?.recordMetric?.(
      "ticketek.structured_music.accepted",
      structuredVerification.acceptedListings.length
    );
    context?.recordMetric?.(
      "ticketek.structured_music.rejected",
      structuredVerification.rejectedCount
    );
    context?.recordMetric?.(
      "ticketek.structured_music.ambiguous",
      structuredVerification.ambiguousCount
    );
    context?.recordMetric?.(
      "ticketek.structured_music.failed",
      structuredVerification.failedCount
    );

    const listings = [...listingsById.values()];
    const listingsNeedingTitleHydration = listings.filter(
      (listing) =>
        enrichTicketekListingWithExactTime(listing, exactTimeLookup)
          .startsAtPrecision !== "exact"
    );

    const exactTimeCountBeforeTitleHydration = exactTimeLookup.size;
    await runTicketekTitleHydrationBatch({
      listings: listingsNeedingTitleHydration,
      exactTimeLookup,
      fetchImpl,
      titleQueryCache
    });
    context?.recordMetric?.(
      "ticketek.title_hydration.listings",
      listingsNeedingTitleHydration.length
    );
    context?.recordMetric?.(
      "ticketek.title_hydration.new_exact_time_keys",
      Math.max(0, exactTimeLookup.size - exactTimeCountBeforeTitleHydration)
    );

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
