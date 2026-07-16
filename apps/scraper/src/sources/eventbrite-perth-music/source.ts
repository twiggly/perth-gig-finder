import type { NormalizedGig } from "@perth-gig-finder/shared";

import { mapWithConcurrency } from "../../source-utils/concurrency";
import type { SourceAdapter, SourceAdapterResult } from "../../types";
import {
  normalizeEventbriteDetailPage,
  normalizeEventbriteDiscoveryUrl,
  normalizeEventbriteEventUrl,
  parseEventbriteDiscoveryPage,
  repairEventbriteArtists
} from "./parser";
import type {
  EventbriteDiscoveryListing,
  EventbriteDiscoveryPagination
} from "./types";

const SOURCE_URL =
  "https://www.eventbrite.com.au/d/australia--perth--4807/music--events/?page=1";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_DISCOVERY_PAGES = 12;
const DETAIL_CONCURRENCY = 4;
const REQUEST_USER_AGENT =
  "Mozilla/5.0 (compatible; PerthGigFinder/1.0; +https://gigradar.com.au/)";

async function fetchEventbriteHtml(
  fetchImpl: typeof fetch,
  url: string
): Promise<{ html: string; finalUrl: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": REQUEST_USER_AGENT
      },
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Eventbrite returned status ${response.status}`);
    }

    return {
      html: await response.text(),
      finalUrl: response.url || url
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Eventbrite request timed out");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function paginationMatches(
  expected: EventbriteDiscoveryPagination,
  actual: EventbriteDiscoveryPagination
): boolean {
  return (
    actual.objectCount === expected.objectCount &&
    actual.pageCount === expected.pageCount &&
    actual.pageSize === expected.pageSize
  );
}

function getDetailFailureMetricName(error: unknown): string {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("resolve uniquely")) {
    return "eventbrite.detail.failure.structured_event";
  }

  if (message.includes("redirected") || message.includes("event URL")) {
    return "eventbrite.detail.failure.url";
  }

  if (message.includes("date")) {
    return "eventbrite.detail.failure.date";
  }

  if (message.includes("missing")) {
    return "eventbrite.detail.failure.missing_data";
  }

  return "eventbrite.detail.failure.other";
}

export const eventbritePerthMusicSource: SourceAdapter = {
  slug: "eventbrite-perth-music",
  name: "Eventbrite Perth Music",
  baseUrl: SOURCE_URL,
  priority: 5,
  isPublicListingSource: true,
  async fetchListings(fetchImpl = fetch, context): Promise<SourceAdapterResult> {
    const listingsById = new Map<string, EventbriteDiscoveryListing>();
    const seenPageUrls = new Set<string>();
    let nextPageUrl: string | null = SOURCE_URL;
    let expectedPagination: EventbriteDiscoveryPagination | null = null;
    let discoveryPageCount = 0;
    let failedCount = 0;

    while (nextPageUrl && discoveryPageCount < MAX_DISCOVERY_PAGES) {
      const pageUrl = normalizeEventbriteDiscoveryUrl(nextPageUrl);

      if (!pageUrl || seenPageUrls.has(pageUrl)) {
        failedCount += 1;
        break;
      }

      seenPageUrls.add(pageUrl);

      try {
        const response = await fetchEventbriteHtml(fetchImpl, pageUrl);
        const finalPageUrl = normalizeEventbriteDiscoveryUrl(response.finalUrl);

        if (!finalPageUrl || finalPageUrl !== pageUrl) {
          throw new Error("Eventbrite discovery redirected outside the Perth route");
        }

        const parsed = parseEventbriteDiscoveryPage({
          html: response.html,
          pageUrl: finalPageUrl
        });
        discoveryPageCount += 1;
        failedCount += parsed.failedCount;

        if (!expectedPagination) {
          expectedPagination = parsed.pagination;

          if (expectedPagination.pageCount > MAX_DISCOVERY_PAGES) {
            failedCount += 1;
          }
        } else if (!paginationMatches(expectedPagination, parsed.pagination)) {
          failedCount += 1;
        }

        if (parsed.pagination.pageNumber !== discoveryPageCount) {
          failedCount += 1;
        }

        for (const listing of parsed.listings) {
          if (!listingsById.has(listing.externalId)) {
            listingsById.set(listing.externalId, listing);
          }
        }

        nextPageUrl = parsed.nextPageUrl;
      } catch {
        failedCount += 1;
        nextPageUrl = null;
        break;
      }
    }

    if (nextPageUrl) {
      failedCount += 1;
    }

    if (
      expectedPagination &&
      (discoveryPageCount !== expectedPagination.pageCount ||
        listingsById.size !== expectedPagination.objectCount)
    ) {
      failedCount += 1;
    }

    const listings = [...listingsById.values()];
    context?.recordMetric?.("eventbrite.discovery.pages", discoveryPageCount);
    context?.recordMetric?.("eventbrite.discovery.candidates", listings.length);
    context?.recordMetric?.("eventbrite.discovery.failed", failedCount);
    context?.recordMetric?.("eventbrite.detail.attempted", listings.length);

    let acceptedCount = 0;
    let rejectedCount = 0;
    let detailFailedCount = 0;
    const detailFailureMetrics = new Map<string, number>();
    const detailResults = await mapWithConcurrency(
      listings,
      DETAIL_CONCURRENCY,
      async (listing): Promise<NormalizedGig | null> => {
        try {
          const response = await fetchEventbriteHtml(fetchImpl, listing.eventUrl);
          const finalEventUrl = normalizeEventbriteEventUrl(
            response.finalUrl,
            listing.externalId
          );

          if (!finalEventUrl) {
            throw new Error("Eventbrite detail redirected to a different event");
          }

          const gig = normalizeEventbriteDetailPage({
            html: response.html,
            eventUrl: finalEventUrl,
            listing
          });

          if (gig) {
            acceptedCount += 1;
          } else {
            rejectedCount += 1;
          }

          return gig;
        } catch (error) {
          detailFailedCount += 1;
          const metricName = getDetailFailureMetricName(error);
          detailFailureMetrics.set(
            metricName,
            (detailFailureMetrics.get(metricName) ?? 0) + 1
          );
          return null;
        }
      }
    );

    failedCount += detailFailedCount;
    context?.recordMetric?.("eventbrite.detail.accepted", acceptedCount);
    context?.recordMetric?.("eventbrite.detail.rejected", rejectedCount);
    context?.recordMetric?.("eventbrite.detail.failed", detailFailedCount);
    for (const [metricName, count] of detailFailureMetrics) {
      context?.recordMetric?.(metricName, count);
    }

    return {
      gigs: detailResults
        .filter((gig): gig is NormalizedGig => Boolean(gig))
        .sort((left, right) =>
          left.startsAt === right.startsAt
            ? left.title.localeCompare(right.title)
            : left.startsAt.localeCompare(right.startsAt)
        ),
      failedCount
    };
  },
  repairArtists: repairEventbriteArtists
};
